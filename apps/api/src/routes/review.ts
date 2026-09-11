import { type Criterion, weightedOverall } from "@hirelens/core";
import { candidates, decisions, rubrics, scores, scoringRuns } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Serialized rubric payload → criteria array for weighting. */
function criteriaOf(payload: Record<string, unknown>): Criterion[] {
  const c = payload["criteria"];
  return Array.isArray(c) ? (c as Criterion[]) : [];
}

/** Latest persisted score row per criterion for a candidate (any run). */
async function latestRubric(db: AppEnv["Variables"]["db"], jobId: string) {
  const [row] = await db
    .select({ payload: rubrics.payload, version: rubrics.version })
    .from(rubrics)
    .where(eq(rubrics.jobId, jobId))
    .orderBy(desc(rubrics.version))
    .limit(1);
  return row ?? null;
}

export function reviewRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /**
   * Record a review decision. Stage + required reason; the stage column is
   * the candidate's current state and the append-only decisions table keeps
   * the full history. Every decision is written to the hash-chained audit log.
   */
  routes.post("/decisions", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const BodySchema = z.object({
      candidateId: z.string().uuid(),
      stage: z.enum(["new", "shortlisted", "advanced", "rejected"]),
      reason: z.string().trim().min(3).max(2000),
    });
    const parsed = BodySchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    const { candidateId, stage, reason } = parsed.data;

    // Candidate must belong to this job (org scoping via the job above).
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.jobId, job.id)))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);

    const [row] = await db
      .insert(decisions)
      .values({
        candidateId,
        stage,
        reason,
        decidedBy: auth.userId,
      })
      .returning({ id: decisions.id, decidedAt: decisions.decidedAt });

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "decision.recorded",
      payload: { jobId: job.id, candidateId, stage, reason },
    });

    return c.json({ ok: true, decision: row }, 201);
  });

  /**
   * Manual score override. The scores row's authoritative `score` is updated
   * and the override author + reason are recorded on the row and in the
   * audit log. Requires edit role.
   */
  routes.patch("/scores/:scoreId", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const BodySchema = z.object({
      score: z.number().min(0).max(5),
      reason: z.string().trim().min(3).max(2000),
    });
    const parsed = BodySchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    const { score, reason } = parsed.data;
    const scoreId = c.req.param("scoreId") ?? "";

    // The score row must belong to a run of this job (org scoping).
    const [target] = await db
      .select({ id: scores.id, candidateId: scores.candidateId, previous: scores.score })
      .from(scores)
      .innerJoin(scoringRuns, eq(scoringRuns.id, scores.runId))
      .where(and(eq(scores.id, scoreId), eq(scoringRuns.jobId, job.id)))
      .limit(1);
    if (!target) return c.json({ ok: false, error: "not_found" }, 404);

    const [row] = await db
      .update(scores)
      .set({ score, overriddenBy: auth.userId, overrideReason: reason })
      .where(eq(scores.id, scoreId))
      .returning({ id: scores.id, score: scores.score });

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "score.overridden",
      payload: {
        jobId: job.id,
        scoreId,
        candidateId: target.candidateId,
        previous: target.previous,
        score,
        reason,
      },
    });

    return c.json({ ok: true, score: row });
  });

  /**
   * Ranked review table for the job: latest overall per candidate from the
   * most recent completed run, plus current stage and decision history.
   */
  routes.get("/review", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const rubricRow = await latestRubric(db, job.id);
    const criteria = rubricRow ? criteriaOf(rubricRow.payload) : [];

    // Most recent run per candidate: pull completed runs newest-first.
    const runs = await db
      .select({ id: scoringRuns.id })
      .from(scoringRuns)
      .where(and(eq(scoringRuns.jobId, job.id), eq(scoringRuns.status, "completed")))
      .orderBy(desc(scoringRuns.startedAt));

    const byCandidate = new Map<
      string,
      { candidateId: string; overall: number; overridden: number; criteria: number }
    >();

    for (const run of runs) {
      const rows = await db
        .select({
          candidateId: scores.candidateId,
          criterionKey: scores.criterionKey,
          score: scores.score,
          overriddenBy: scores.overriddenBy,
        })
        .from(scores)
        .where(eq(scores.runId, run.id));
      // Newest completed run wins per candidate — skip if already scored.
      const perCandidate = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = perCandidate.get(row.candidateId) ?? [];
        list.push(row);
        perCandidate.set(row.candidateId, list);
      }
      for (const [candidateId, list] of perCandidate) {
        if (byCandidate.has(candidateId)) continue;
        const overall = weightedOverall(
          criteria,
          list.map((s) => ({
            key: s.criterionKey,
            score: s.score,
            confidence: 0,
            rationale: "",
          })),
        );
        byCandidate.set(candidateId, {
          candidateId,
          overall,
          overridden: list.filter((s) => s.overriddenBy !== null).length,
          criteria: list.length,
        });
      }
    }

    // Stage + decisions from the append-only table.
    const decisionRows = await db
      .select({
        candidateId: decisions.candidateId,
        stage: decisions.stage,
        reason: decisions.reason,
        decidedAt: decisions.decidedAt,
      })
      .from(decisions)
      .innerJoin(candidates, eq(candidates.id, decisions.candidateId))
      .where(eq(candidates.jobId, job.id))
      .orderBy(desc(decisions.decidedAt));

    const stageByCandidate = new Map<string, string>();
    for (const d of decisionRows) {
      if (!stageByCandidate.has(d.candidateId)) stageByCandidate.set(d.candidateId, d.stage);
    }

    const review = [...byCandidate.values()].map((r) => ({
      ...r,
      stage: stageByCandidate.get(r.candidateId) ?? "new",
    }));

    return c.json({ ok: true, review, decisionHistory: decisionRows });
  });

  return routes;
}
