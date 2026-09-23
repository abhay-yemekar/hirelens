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
 * Deliberate limits: fetches only HTTPS URLs, ≤ 10 MiB, and never
 * overwrites anything in the ATS (push-back is explicit).
 */

import type { Database } from "@hirelens/db";
import { apiTokens, candidates, jobs } from "@hirelens/db";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ingestBytes } from "../ingest.js";
import type { AppEnv } from "../types.js";
import { hashToken } from "./tokens.js";

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

interface TokenAuth {
  orgId: string;
  tokenId: string;
}

async function authenticateToken(
  db: Database,
  header: string | undefined,
): Promise<TokenAuth | null> {
  if (header === undefined || !header.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (raw.length < 8) return null;
  const [row] = await db
    .select({ orgId: apiTokens.orgId, tokenId: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(raw)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (row === undefined) return null;
  // Rotation hygiene: touch lastUsedAt, never block the response on it.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.tokenId))
    .catch(() => undefined);
  return row;
}

async function fetchResumeBytes(url: string): Promise<{ bytes: Uint8Array; filename: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ResponseError("invalid_resume_url", "resumeUrl is not a valid URL", 400);
  }
  // HTTPS only — resumes are PII; we do not fetch them over plaintext.
  if (parsed.protocol !== "https:") {
    throw new ResponseError("insecure_url", "resumeUrl must be https", 400);
  }
  let res: Response;
  try {
    res = await fetch(parsed, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ResponseError("fetch_failed", "resume download failed (network error)", 502);
  }
  if (!res.ok) {
    throw new ResponseError("fetch_failed", `resume download failed: HTTP ${res.status}`, 502);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_FETCH_BYTES) {
    throw new ResponseError("file_too_large", "resume exceeds 10 MiB", 413);
  }
  const filename = parsed.pathname.split("/").pop() || "resume.pdf";
  return { bytes: buf, filename: decodeURIComponent(filename) };
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
