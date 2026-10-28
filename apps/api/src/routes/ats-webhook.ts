/**
 * Inbound ATS webhook (v1.2) — POST /api/webhooks/ats.
 *
 * The integration surface promised in the ATS guide: an ATS (Greenhouse,
 * Lever, or a Zapier relay) POSTs a candidate at a stage; HireLens fetches
 * the resume, ingests it into the target job, and the review queue fills
 * in. Bearer-token auth via org-scoped API tokens; idempotent per
 * (job, candidate text) through ingest's content-hash dedupe; results read
 * back through the normal API or the CLI.
 *
 * Deliberate limits: fetches only HTTPS URLs on public hosts (redirects
 * re-checked hop by hop), ≤ 10 MiB, and never overwrites anything in the
 * ATS (push-back is explicit).
 */

import type { Database } from "@hirelens/db";
import { candidates, jobs } from "@hirelens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ingestBytes } from "../ingest.js";
import { fetchPublicHttps, PublicFetchError, type PublicFetchErrorKind } from "../public-fetch.js";
import { authenticateToken } from "../token-auth.js";
import type { AppEnv } from "../types.js";

const MAX_FETCH_BYTES = 10 * 1024 * 1024;

const WebhookSchema = z.object({
  jobId: z.string().uuid(),
  candidate: z.object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().max(200).optional(),
    resumeUrl: z.string().url(),
  }),
});

/** Minimal typed error carrying an HTTP status for the handler. */
class ResponseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 413 | 502,
  ) {
    super(message);
  }
}

const FETCH_ERRORS: Record<PublicFetchErrorKind, { code: string; status: 400 | 413 | 502 }> = {
  invalid: { code: "invalid_resume_url", status: 400 },
  insecure: { code: "insecure_url", status: 400 },
  blocked: { code: "blocked_url", status: 400 },
  failed: { code: "fetch_failed", status: 502 },
  too_large: { code: "file_too_large", status: 413 },
};

async function fetchResumeBytes(url: string): Promise<{ bytes: Uint8Array; filename: string }> {
  // HTTPS to public hosts only — resumes are PII, and the URL is caller-supplied.
  let bytes: Uint8Array;
  try {
    bytes = await fetchPublicHttps(url, { maxBytes: MAX_FETCH_BYTES, timeoutMs: 15_000 });
  } catch (err) {
    if (err instanceof PublicFetchError) {
      const { code, status } = FETCH_ERRORS[err.kind];
      throw new ResponseError(code, `resumeUrl: ${err.message}`, status);
    }
    throw err;
  }
  const filename = new URL(url).pathname.split("/").pop() || "resume.pdf";
  return { bytes, filename: decodeURIComponent(filename) };
}

/** Public (token-authenticated, not session-authenticated) webhook surface. */
export function atsWebhookRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/webhooks/ats", async (c) => {
    const db = c.get("db");
    const tokenAuth = await authenticateToken(db, c.req.header("authorization"));
    if (tokenAuth === null) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid_json" }, 400);
    }
    const parsed = WebhookSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400);
    }

    // The job must belong to the token's org — token scope is the only scope.
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, parsed.data.jobId), eq(jobs.orgId, tokenAuth.orgId)))
      .limit(1);
    if (job === undefined) {
      return c.json({ ok: false, error: "job_not_found" }, 404);
    }

    let fetched: { bytes: Uint8Array; filename: string };
    try {
      fetched = await fetchResumeBytes(parsed.data.candidate.resumeUrl);
    } catch (err) {
      if (err instanceof ResponseError) {
        return c.json({ ok: false, error: err.code, message: err.message }, err.status);
      }
      throw err;
    }

    // Ingest is idempotent per (job, text hash): ATS retries are safe.
    const result = await ingestBytes(
      db,
      { jobId: job.id, filename: fetched.filename, bytes: fetched.bytes },
      c.get("indexer"),
    );

    if (parsed.data.candidate.email !== undefined && result.status === "created") {
      // Persist the ATS-provided email for the recruiter contact column.
      await db
        .update(candidates)
        .set({ contactEmail: parsed.data.candidate.email })
        .where(eq(candidates.id, result.candidateId));
    }

    return c.json(
      {
        ok: true,
        status: result.status,
        candidateId: result.candidateId,
      },
      result.status === "created" ? 201 : 200,
    );
  });

  return routes;
}
