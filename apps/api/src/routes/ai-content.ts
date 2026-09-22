/**
 * AI-content detection endpoint (v1.2).
 *
 * GET /jobs/:jobId/candidates/:candidateId/ai-content — runs the
 * deterministic core detector over the stored resume text. Viewer role is
 * enough (it's an oversight signal, not an action). The report is framed
 * as "worth probing", never as a verdict — the UI copy mirrors that.
 */

import { detectAiContent } from "@hirelens/core";
import { candidates, documents, jobs } from "@hirelens/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_MIN, requireAuth } from "../auth.js";
import type { AppEnv } from "../types.js";

export function aiContentRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/:candidateId/ai-content", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, c.req.param("jobId") ?? ""), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const candidateId = c.req.param("candidateId") ?? "";
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.jobId, job.id)))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);

    const [doc] = await db
      .select({ rawText: documents.rawText })
      .from(documents)
      .where(eq(documents.candidateId, candidate.id))
      .limit(1);
    if (!doc?.rawText) {
      return c.json({ ok: false, error: "no_text" }, 404);
    }

    const report = detectAiContent(doc.rawText);
    return c.json({ ok: true, aiContent: report });
  });

  return routes;
}
