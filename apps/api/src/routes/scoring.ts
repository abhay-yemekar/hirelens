import { expandZip } from "@hirelens/core";
import { scoringRuns } from "@hirelens/db";
import { runBatch } from "@hirelens/orchestrator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { type IngestResult, ingestBytes } from "../ingest.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Scoring + candidate routes, mounted at /api/jobs/:jobId/... */
export function scoringRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** Kick off a scoring batch against the job's latest rubric. */
  routes.post("/score", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const model = c.get("model");
    if (!model) return c.json({ ok: false, error: "llm_not_configured" }, 503);

    const summary = await runBatch(db, model, {
      jobId: job.id,
      orgId: auth.orgId,
      actorId: auth.userId,
    });
    return c.json({ ok: true, summary });
  });

  /** Run history for the job, newest first. */
  routes.get("/runs", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await db
      .select()
      .from(scoringRuns)
      .where(eq(scoringRuns.jobId, job.id))
      .orderBy(desc(scoringRuns.startedAt));
    return c.json({ ok: true, runs: rows });
  });

  /** Single-file upload: extract → parse → persist as a candidate. */
  routes.post("/candidates", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ ok: false, error: "file_required" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await ingestBytes(db, { jobId: job.id, filename: file.name, bytes });
    return c.json({ ok: true, ...result }, result.status === "created" ? 201 : 200);
  });

  /** ZIP batch upload: safe expansion, then ingest each entry. */
  routes.post("/candidates/zip", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ ok: false, error: "file_required" }, 400);

    let expanded: ReturnType<typeof expandZip>;
    try {
      expanded = expandZip(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: "invalid_zip", message }, 400);
    }

    const ingested: IngestResult[] = [];
    const skipped: Array<{ name: string; reason: string }> = expanded.skipped.map((s) => ({
      name: s.filename,
      reason: s.reason,
    }));
    for (const entry of expanded.entries) {
      try {
        ingested.push(
          await ingestBytes(db, { jobId: job.id, filename: entry.filename, bytes: entry.data }),
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ name: entry.filename, reason });
      }
    }
    const created = ingested.filter((r) => r.status === "created").length;
    const duplicates = ingested.filter((r) => r.status === "duplicate").length;
    return c.json({ ok: true, created, duplicates, skipped, ingested });
  });

  return routes;
}
