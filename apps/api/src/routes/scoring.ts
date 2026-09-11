import { type Criterion, expandZip, weightedOverall } from "@hirelens/core";
import { evidence, rubrics, scores, scoringRuns } from "@hirelens/db";
import { runBatch } from "@hirelens/orchestrator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { type IngestResult, ingestBytes } from "../ingest.js";
import type { AppEnv } from "../types.js";
import { candidateReadRoutes } from "./candidates-read.js";
import { loadOrgJob } from "./jobs.js";

/** Serialized rubric payload → criteria array for weighting. */
function criteriaOf(payload: Record<string, unknown>): Criterion[] {
  const c = payload["criteria"];
  return Array.isArray(c) ? (c as Criterion[]) : [];
}

/** Run detail: the run, per-candidate overall + per-criterion scores, evidence. */
async function runDetail(db: AppEnv["Variables"]["db"], runId: string) {
  const [run] = await db.select().from(scoringRuns).where(eq(scoringRuns.id, runId)).limit(1);
  if (!run) return null;

  const [rubricRow] = await db
    .select({ payload: rubrics.payload })
    .from(rubrics)
    .where(and(eq(rubrics.jobId, run.jobId), eq(rubrics.version, run.rubricVersion)))
    .limit(1);
  const criteria = rubricRow ? criteriaOf(rubricRow.payload) : [];

  const scoreRows = await db
    .select({
      id: scores.id,
      candidateId: scores.candidateId,
      criterionKey: scores.criterionKey,
      score: scores.score,
      confidence: scores.confidence,
      rationale: scores.rationale,
      overriddenBy: scores.overriddenBy,
      overrideReason: scores.overrideReason,
    })
    .from(scores)
    .where(eq(scores.runId, runId));

  const evidenceRows = await db
    .select({
      scoreId: evidence.scoreId,
      documentId: evidence.documentId,
      startOffset: evidence.startOffset,
      endOffset: evidence.endOffset,
      quotedText: evidence.quotedText,
    })
    .from(evidence)
    .innerJoin(scores, eq(scores.id, evidence.scoreId))
    .where(eq(scores.runId, runId));

  // Per-candidate overall via the rubric's own weights (0–100).
  // Map evidence rows onto the owning candidate via the score join key.
  const scoreOwner = new Map(scoreRows.map((s) => [s.id, s.candidateId]));
  const byCandidate = new Map<
    string,
    { scores: typeof scoreRows; evidence: typeof evidenceRows }
  >();
  for (const s of scoreRows) {
    let entry = byCandidate.get(s.candidateId);
    if (!entry) {
      entry = { scores: [], evidence: [] };
      byCandidate.set(s.candidateId, entry);
    }
    entry.scores.push(s);
  }
  for (const e of evidenceRows) {
    const owner = scoreOwner.get(e.scoreId);
    if (owner) byCandidate.get(owner)?.evidence.push(e);
  }

  const candidates = [...byCandidate.entries()].map(([candidateId, entry]) => {
    const overall = weightedOverall(
      criteria,
      entry.scores.map((s) => ({
        key: s.criterionKey,
        score: s.score,
        confidence: s.confidence ?? 0,
        rationale: s.rationale ?? "",
      })),
    );
    const evidenceByScore = new Map<string, typeof evidenceRows>();
    for (const e of entry.evidence) {
      const list = evidenceByScore.get(e.scoreId) ?? [];
      list.push(e);
      evidenceByScore.set(e.scoreId, list);
    }
    return {
      candidateId,
      overall,
      criteria: entry.scores.map((s) => ({ ...s, evidence: evidenceByScore.get(s.id) ?? [] })),
    };
  });

  return { run, candidates };
}

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

  /** Run detail: per-candidate overall, criterion scores + evidence spans. */
  routes.get("/runs/:runId", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const detail = await runDetail(db, c.req.param("runId") ?? "");
    if (!detail || detail.run.jobId !== job.id) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }
    return c.json({ ok: true, ...detail });
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
