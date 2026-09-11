import { candidates, decisions, documents } from "@hirelens/db";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { blindView } from "../blind.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Candidate read routes, mounted at /api/jobs/:jobId/candidates. */
export function candidateReadRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** List candidates for the job (no raw text — that is the detail endpoint). */
  routes.get("/", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const rows = await db
      .select({
        id: candidates.id,
        language: candidates.language,
        sourceFileKey: candidates.sourceFileKey,
        createdAt: candidates.createdAt,
        pageCount: documents.pageCount,
      })
      .from(candidates)
      .leftJoin(documents, eq(documents.candidateId, candidates.id))
      .where(eq(candidates.jobId, job.id))
      .orderBy(desc(candidates.createdAt));
    return c.json({ ok: true, candidates: rows });
  });

  /** Candidate detail: parsed profile + full document text + decisions. */
  routes.get("/:candidateId", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const candidateId = c.req.param("candidateId") ?? "";
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);
    if (!candidate || candidate.jobId !== job.id) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    const docs = await db
      .select({
        id: documents.id,
        kind: documents.kind,
        rawText: documents.rawText,
        pageCount: documents.pageCount,
        layoutMeta: documents.layoutMeta,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.candidateId, candidate.id));

    // Blind review: `?blind=1` masks identity cues server-side. Masking
    // preserves character length so evidence spans stay aligned.
    const blind = c.req.query("blind") === "1";
    const masked = blind ? docs.map((d) => ({ ...d, rawText: blindView(d.rawText) })) : docs;

    const decisionRows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.candidateId, candidate.id))
      .orderBy(desc(decisions.decidedAt));

    return c.json({ ok: true, candidate, documents: masked, decisions: decisionRows });
  });

  return routes;
}
