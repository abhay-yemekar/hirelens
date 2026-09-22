/**
 * Org analytics (v1.2) — read-only aggregates for the recruiter dashboard.
 *
 * One endpoint, five slices, all computed from existing rows (no schema
 * change, no LLM calls):
 *  - jobs      — count by lifecycle status
 *  - pipeline  — candidates per stage from the latest decision per candidate
 *  - scores    — distribution (0–5 buckets) + org average
 *  - speed     — median/avg time from run start to decision
 *  - bias      — latest four-fifths outcome per job (from the audit log)
 *
 * Org-scoped via the jobs table; viewer role is enough (aggregates are for
 * oversight). Small datasets in the free/self-host tier — plain JS after a
 * few scoped queries; no window functions needed.
 */

import { auditLog, candidates, decisions, jobs, scores, scoringRuns } from "@hirelens/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_MIN, requireAuth } from "../auth.js";
import type { AppEnv } from "../types.js";

/** Median of a numeric array (average of middle two for even lengths). */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lo = sorted[mid - 1] ?? sorted[mid] ?? 0;
  const hi = sorted[mid] ?? lo;
  const m = sorted.length % 2 === 1 ? (sorted[mid] ?? lo) : (lo + hi) / 2;
  return Math.round(m * 10) / 10;
}

export function analyticsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");

    const orgJobs = await db
      .select({ id: jobs.id, title: jobs.title, status: jobs.status, createdAt: jobs.createdAt })
      .from(jobs)
      .where(eq(jobs.orgId, auth.orgId))
      .orderBy(desc(jobs.createdAt));
    const jobIds = orgJobs.map((j) => j.id);

    // ── Jobs by status ──────────────────────────────────────────────
    const jobsByStatus: Record<string, number> = {};
    for (const j of orgJobs) jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;

    // ── Pipeline: latest decision per candidate across the org ──────
    const pipeline = { new: 0, shortlisted: 0, advanced: 0, rejected: 0 } as Record<string, number>;
    let decisionCount = 0;
    if (jobIds.length > 0) {
      const candRows = await db
        .select({ id: candidates.id, jobId: candidates.jobId })
        .from(candidates)
        .where(inArray(candidates.jobId, jobIds));
      const candById = new Map(candRows.map((r) => [r.id, r.jobId]));
      if (candRows.length > 0) {
        const decisionRows = await db
          .select({
            candidateId: decisions.candidateId,
            stage: decisions.stage,
            decidedAt: decisions.decidedAt,
          })
          .from(decisions)
          .orderBy(decisions.decidedAt);
        const latestStage = new Map<string, string>();
        for (const d of decisionRows) {
          if (candById.has(d.candidateId)) {
            latestStage.set(d.candidateId, d.stage);
            decisionCount += 0; // counted via latestStage below
          }
        }
        decisionCount = latestStage.size;
        for (const id of candById.keys()) {
          const stage = latestStage.get(id) ?? "new";
          pipeline[stage] = (pipeline[stage] ?? 0) + 1;
        }
      }
    }

    // ── Scores: distribution + org average (latest runs per job) ────
    let avgOverall: number | null = null;
    let distribution: Array<{ band: string; count: number }> = [];
    if (jobIds.length > 0) {
      // Weighted overall per candidate per run is expensive to recompute;
      // the review read-model already stores per-criterion 0–5. For the
      // org histogram we bucket raw criterion scores — honest for a
      // distribution, and cheap.
      const runRows = await db
        .select({ id: scoringRuns.id })
        .from(scoringRuns)
        .where(inArray(scoringRuns.jobId, jobIds));
      const runIds = runRows.map((r) => r.id);
      if (runIds.length > 0) {
        const scoreRows = await db
          .select({ score: scores.score })
          .from(scores)
          .where(inArray(scores.runId, runIds));
        const buckets = [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number];
        let total = 0;
        for (const s of scoreRows) {
          const idx = Math.min(5, Math.max(0, Math.round(s.score))) as 0 | 1 | 2 | 3 | 4 | 5;
          buckets[idx] += 1;
          total += s.score;
        }
        distribution = ["0", "1", "2", "3", "4", "5"].map((band, i) => ({
          band: `${band}s`,
          count: buckets[i] ?? 0,
        }));
        avgOverall =
          scoreRows.length > 0 ? Math.round((total / scoreRows.length) * 100) / 100 : null;
      }
    }

    // ── Speed: run start → decision, per candidate (latest decision) ─
    let medianHoursToDecision: number | null = null;
    if (jobIds.length > 0) {
      const candRows = await db
        .select({ id: candidates.id, createdAt: candidates.createdAt })
        .from(candidates)
        .where(inArray(candidates.jobId, jobIds));
      const decisionRows =
        candRows.length > 0
          ? await db
              .select({
                candidateId: decisions.candidateId,
                decidedAt: decisions.decidedAt,
              })
              .from(decisions)
              .orderBy(decisions.decidedAt)
          : [];
      const decidedAtByCandidate = new Map<string, Date>();
      for (const d of decisionRows) {
        if (candRows.some((cr) => cr.id === d.candidateId)) {
          decidedAtByCandidate.set(d.candidateId, d.decidedAt);
        }
      }
      const uploadAtByCandidate = new Map(candRows.map((r) => [r.id, r.createdAt]));
      const durationsHours: number[] = [];
      for (const [cid, decidedAt] of decidedAtByCandidate) {
        const uploadedAt = uploadAtByCandidate.get(cid);
        if (uploadedAt) {
          durationsHours.push((decidedAt.getTime() - uploadedAt.getTime()) / 3_600_000);
        }
      }
      medianHoursToDecision = median(durationsHours);
    }

    // ── Bias: latest four-fifths outcome per job (audit log actions) ─
    // Sourced from appendAudit payloads so the dashboard reflects exactly
    // what auditors saw — recomputing here could drift.
    let auditsRun = 0;
    let lastFlaggedJobTitle: string | null = null;
    if (jobIds.length > 0) {
      const auditRows = await db
        .select({ payload: auditLog.payload, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(eq(auditLog.orgId, auth.orgId), eq(auditLog.action, "bias_audit.generated")))
        .orderBy(desc(auditLog.createdAt))
        .limit(200);
      const seenJobs = new Set<string>();
      for (const row of auditRows) {
        const jobId = typeof row.payload?.["jobId"] === "string" ? row.payload["jobId"] : null;
        const allPass = row.payload?.["allPass"];
        if (jobId && !seenJobs.has(jobId)) {
          seenJobs.add(jobId);
          auditsRun += 1;
          if (allPass === false) {
            const job = orgJobs.find((j) => j.id === jobId);
            lastFlaggedJobTitle = job?.title ?? null;
            break; // most recent flagged outcome wins
          }
        }
      }
    }

    return c.json({
      ok: true,
      analytics: {
        jobs: { total: orgJobs.length, byStatus: jobsByStatus },
        pipeline,
        decisions: { total: decisionCount },
        scores: { avgCriterion: avgOverall, distribution },
        speed: { medianHoursToDecision },
        bias: { auditsRun, lastFlaggedJobTitle },
        generatedAt: new Date().toISOString(),
      },
    });
  });

  return routes;
}
