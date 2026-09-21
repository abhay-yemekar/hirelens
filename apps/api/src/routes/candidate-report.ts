/**
 * Candidate report links (v1.1) — candidate-side transparency.
 *
 * A recruiter generates a per-candidate link; the candidate opens it (no
 * account) and sees their own outcome: per-criterion scores with the exact
 * evidence quotes, the anchored scale, and an overall band — never other
 * candidates, contact info, files, or demographics. The token is the only
 * credential: shown once, revocable instantly, read-counted, and every
 * lifecycle step is hash-chain audited.
 *
 * The report is a *projection*: it reuses the run read-model but keeps only
 * what is safe and useful for the candidate — no resume text, no file, no
 * per-candidate ranking position beyond their own band, no org identity
 * beyond the job title.
 */

import { randomBytes } from "node:crypto";
import type { Criterion } from "@hirelens/core";
import {
  candidateReportLinks,
  candidates,
  evidence as evidenceTable,
  jobs,
  rubrics,
  scores as scoresTable,
  scoringRuns,
} from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

const CreateReportSchema = z.object({
  /** Optional recruiter note to the candidate (shown on the report). */
  message: z.string().trim().max(500).optional(),
});

/** Rubric payload shape (criteria with anchored scales). */
interface StoredRubric {
  title?: unknown;
  criteria?: unknown;
}

function criteriaOf(payload: unknown): Criterion[] {
  if (!payload || typeof payload !== "object") return [];
  const c = (payload as StoredRubric).criteria;
  return Array.isArray(c) ? (c as Criterion[]) : [];
}

function rubricTitleOf(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const t = (payload as StoredRubric).title;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return "Screening rubric";
}

/** Score band wording — candidates get a band, not a raw leaderboard rank. */
function bandFor(overall: number): string {
  if (overall >= 80) return "Strong match";
  if (overall >= 60) return "Good match";
  if (overall >= 40) return "Partial match";
  return "Emerging match";
}

/** Auth-scoped CRUD, mounted at /jobs/:jobId/candidates/:candidateId/report. */
export function candidateReportRoutes() {
  const routes = new Hono<AppEnv>();

  /** List the candidate's report links. Viewer is enough.
   * Mounted at /jobs/:jobId/candidates, so the candidate id is a path param. */
  routes.get("/:candidateId/report", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, c.req.param("candidateId") ?? ""), eq(candidates.jobId, job.id)))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);

    const rows = await db
      .select({
        id: candidateReportLinks.id,
        message: candidateReportLinks.message,
        revokedAt: candidateReportLinks.revokedAt,
        createdAt: candidateReportLinks.createdAt,
        readCount: candidateReportLinks.readCount,
      })
      .from(candidateReportLinks)
      .where(eq(candidateReportLinks.candidateId, candidate.id))
      .orderBy(desc(candidateReportLinks.createdAt));

    return c.json({ ok: true, links: rows });
  });

  /** Create a report link for this candidate. Token returned once. */
  routes.post("/:candidateId/report", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const candidateId = c.req.param("candidateId") ?? "";
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.jobId, job.id)))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);

    // The report needs at least one completed run, or there is nothing to show.
    const [run] = await db
      .select({ id: scoringRuns.id })
      .from(scoringRuns)
      .where(and(eq(scoringRuns.jobId, job.id), eq(scoringRuns.status, "completed")))
      .orderBy(desc(scoringRuns.rubricVersion), desc(scoringRuns.startedAt))
      .limit(1);
    if (!run) {
      return c.json(
        { ok: false, error: "no_scores", message: "Score the candidate before sharing a report." },
        409,
      );
    }

    const parsed = CreateReportSchema.safeParse(await readJson(c).catch(() => ({})));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    // Supersede earlier active links — one live link per candidate.
    await db
      .update(candidateReportLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(candidateReportLinks.candidateId, candidate.id),
          isNull(candidateReportLinks.revokedAt),
        ),
      );

    const token = randomBytes(32).toString("base64url");
    const inserted = await db
      .insert(candidateReportLinks)
      .values({
        candidateId: candidate.id,
        token,
        message: parsed.data.message ?? null,
        createdBy: auth.userId,
      })
      .returning({ id: candidateReportLinks.id, createdAt: candidateReportLinks.createdAt });
    const link = inserted[0];
    if (!link) return c.json({ ok: false, error: "internal_error" }, 500);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "candidate_report.created",
      payload: { jobId: job.id, candidateId: candidate.id, linkId: link.id },
    });

    return c.json({ ok: true, link: { id: link.id, token, createdAt: link.createdAt } }, 201);
  });

  /** Revoke a report link (org-scoped via the job's candidates). */
  routes.delete("/:candidateId/report/:linkId", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const jobCandidates = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.jobId, job.id));
    const ids = jobCandidates.map((r) => r.id);

    const [revoked] = await db
      .update(candidateReportLinks)
      .set({ revokedAt: new Date() })
      .where(eq(candidateReportLinks.id, c.req.param("linkId") ?? ""))
      .returning({ id: candidateReportLinks.id, candidateId: candidateReportLinks.candidateId });
    if (!revoked || !ids.includes(revoked.candidateId)) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "candidate_report.revoked",
      payload: { jobId: job.id, linkId: revoked.id },
    });
    return c.json({ ok: true });
  });

  return routes;
}

/** Public (token-gated) report — mounted on the bare app at /report/:token.
 * Deliberately outside requireAuth: the token IS the credential. */
export function publicCandidateReportRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/report/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token") ?? "";

    const [link] = await db
      .select()
      .from(candidateReportLinks)
      .where(eq(candidateReportLinks.token, token))
      .limit(1);
    if (!link) return c.json({ ok: false, error: "not_found" }, 404);
    if (link.revokedAt) return c.json({ ok: false, error: "revoked" }, 410);

    const [candidate] = await db
      .select({ id: candidates.id, jobId: candidates.jobId })
      .from(candidates)
      .where(eq(candidates.id, link.candidateId))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    // Latest completed run THAT ACTUALLY SCORED THIS CANDIDATE — a newer
    // run whose batch failed (rate limits, provider outage) must not blank
    // out a report the earlier run already produced.
    const [run] = await db
      .select({
        id: scoringRuns.id,
        rubricVersion: scoringRuns.rubricVersion,
        modelId: scoringRuns.modelId,
        finishedAt: scoringRuns.finishedAt,
      })
      .from(scoringRuns)
      .innerJoin(scoresTable, eq(scoresTable.runId, scoringRuns.id))
      .where(
        and(
          eq(scoringRuns.jobId, job.id),
          eq(scoringRuns.status, "completed"),
          eq(scoresTable.candidateId, candidate.id),
        ),
      )
      .orderBy(desc(scoringRuns.rubricVersion), desc(scoringRuns.startedAt))
      .limit(1);
    if (!run) return c.json({ ok: false, error: "no_scores" }, 404);

    // This candidate's criterion scores + the exact evidence quotes.
    const scoreRows = await db
      .select()
      .from(scoresTable)
      .where(and(eq(scoresTable.runId, run.id), eq(scoresTable.candidateId, candidate.id)));
    const evidenceRows = scoreRows.length
      ? await db
          .select({
            scoreId: evidenceTable.scoreId,
            quotedText: evidenceTable.quotedText,
          })
          .from(evidenceTable)
          .where(
            inArray(
              evidenceTable.scoreId,
              scoreRows.map((s) => s.id),
            ),
          )
      : [];

    const [rubricRow] = await db
      .select({ payload: rubrics.payload })
      .from(rubrics)
      .where(and(eq(rubrics.jobId, job.id), eq(rubrics.version, run.rubricVersion)))
      .limit(1);
    const allCriteria = criteriaOf(rubricRow?.payload);
    const rubricTitle = rubricTitleOf(rubricRow?.payload);

    const criterionScores = allCriteria.map((crit) => {
      const s = scoreRows.find((row) => row.criterionKey === crit.key);
      const evidence = evidenceRows
        .filter((e) => s && e.scoreId === s.id)
        .map((e) => e.quotedText)
        .filter((q) => q.length > 0);
      return {
        key: crit.key,
        title: crit.title,
        weight: crit.weight,
        score: s?.score ?? null,
        confidence: s?.confidence ?? null,
        rationale: s?.rationale ?? null,
        overridden: s?.overriddenBy != null,
        evidence,
        scale: crit.scale,
      };
    });

    const scoredWeights = criterionScores.filter((x) => x.score !== null);
    const overall =
      scoredWeights.length > 0
        ? (scoredWeights.reduce((acc, x) => acc + (x.score ?? 0) * x.weight, 0) /
            scoredWeights.reduce((acc, x) => acc + x.weight, 0) /
            5) *
          100
        : null;

    await db
      .update(candidateReportLinks)
      .set({ readCount: sql`coalesce(${candidateReportLinks.readCount}, 0) + 1` })
      .where(eq(candidateReportLinks.id, link.id));

    return c.json({
      ok: true,
      report: {
        jobTitle: job.title,
        rubricTitle,
        rubricVersion: run.rubricVersion,
        modelId: run.modelId,
        finishedAt: run.finishedAt,
        overall,
        band: overall === null ? null : bandFor(overall),
        message: link.message,
        criteria: criterionScores,
      },
    });
  });

  return routes;
}
