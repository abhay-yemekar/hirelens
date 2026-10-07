/**
 * Talent-pool rediscovery (v1.4): one org-wide search across every
 * candidate in every job — not just the active job's review queue.
 *
 * GET /api/talent-pool
 *   q        identity search across uploaded filename, email, phone
 *   skills   comma-separated skill names; matches candidates whose parsed
 *            resume lists one (fallback: full-resume text via the same
 *            extractor scoring uses)
 *   stage    filter to candidates whose latest decision is this stage
 *   minScore 0-100 overall (rubric-weighted, same formula as run pages)
 *            on the candidate's most recent completed run
 *   page / pageSize (paginated over the FINAL filtered set)
 *
 * Mechanism: Postgres handles identity/stage filtering; the route then
 * computes skills and rubric-weighted overalls for the org's pool window
 * (newest 2000 candidates — documented bound, generous at org scale) and
 * applies skill/score filters in memory, so `total`, facets, and pagination
 * all describe the same filtered set. Facets always describe the whole
 * window, independent of the active filters.
 *
 * Blind review is honored exactly like the per-job list: `?blind=1` masks
 * every identity cue and drops the `q` filter (a match/no-match would
 * otherwise confirm a candidate exists).
 */

import { skillsInText } from "@hirelens/core";
import {
  candidates,
  decisions,
  documents,
  jobs,
  rubrics,
  scores,
  scoringRuns,
  stageEnum,
} from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { ingestBytes } from "../ingest.js";
import { labelFromFileKey } from "../labels.js";
import type { AppEnv } from "../types.js";

/** Stage display order for sorting the stage facet. */
const STAGE_ORDER = stageEnum.enumValues;

/** How many of the org's newest candidates one request will consider. */
const POOL_WINDOW = 2000;

interface MatchStats {
  overall: number;
  rubricVersion: number;
  runId: string;
}

export function talentPoolRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/talent-pool", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const orgId = auth.orgId;

    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const blind = c.req.query("blind") === "1";
    const q = blind ? "" : (c.req.query("q") ?? "").trim().slice(0, 200);
    const stageParam = (c.req.query("stage") ?? "").trim();
    const stage = (STAGE_ORDER as readonly string[]).includes(stageParam) ? stageParam : null;
    const minScoreRaw = Number(c.req.query("minScore") ?? "");
    const minScore =
      Number.isFinite(minScoreRaw) && minScoreRaw > 0 ? Math.min(100, minScoreRaw) : null;
    const skillsFilter = (c.req.query("skills") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);

    // -- Pool window: newest candidates in the org, with job context. ----
    const filters = [eq(jobs.orgId, orgId)];
    if (q.length > 0) {
      const like = `%${q}%`;
      const match = or(
        ilike(candidates.sourceFileKey, like),
        ilike(candidates.contactEmail, like),
        ilike(candidates.contactPhone, like),
      );
      if (match) filters.push(match);
    }
    if (stage) {
      filters.push(
        sql`${candidates.id} in (select dc.candidate_id from (select distinct on (d.candidate_id) d.candidate_id, d.stage from decisions d order by d.candidate_id, d.decided_at desc) dc where dc.stage = ${stage})`,
      );
    }

    const rows = await db
      .select({
        id: candidates.id,
        jobId: candidates.jobId,
        jobTitle: jobs.title,
        sourceFileKey: candidates.sourceFileKey,
        contactEmail: candidates.contactEmail,
        contactPhone: candidates.contactPhone,
        language: candidates.language,
        createdAt: candidates.createdAt,
        stage: sql<
          string | null
        >`(select d.stage from decisions d where d.candidate_id = ${candidates.id} order by d.decided_at desc limit 1)`,
      })
      .from(candidates)
      .innerJoin(jobs, eq(candidates.jobId, jobs.id))
      .where(and(...filters))
      .orderBy(desc(candidates.createdAt))
      .limit(POOL_WINDOW);

    if (rows.length === 0) {
      return c.json({
        ok: true,
        candidates: [],
        total: 0,
        page,
        pageSize,
        facets: { stages: {}, skills: [] },
      });
    }

    const ids = rows.map((r) => r.id);

    // -- Skills per candidate: parsed resume list, or full-text extract --
    // (the same extractor the skills panel and scoring pipeline use).
    const docRows = await db
      .select({
        candidateId: documents.candidateId,
        parsed: candidates.parsed,
        rawText: documents.rawText,
      })
      .from(documents)
      .innerJoin(candidates, eq(documents.candidateId, candidates.id))
      .where(inArray(candidates.id, ids));

    const skillsByCandidate = new Map<string, string[]>();
    const textByCandidate = new Map<string, string>();
    for (const d of docRows) {
      const parsedSkills = Array.isArray(d.parsed?.["skills"])
        ? d.parsed["skills"].map(String)
        : [];
      const existing = skillsByCandidate.get(d.candidateId) ?? [];
      skillsByCandidate.set(d.candidateId, [...new Set([...existing, ...parsedSkills])]);
      textByCandidate.set(
        d.candidateId,
        (textByCandidate.get(d.candidateId) ?? "") + "\n" + d.rawText,
      );
    }
    for (const [cid, skills] of skillsByCandidate) {
      if (skills.length === 0) {
        const text = textByCandidate.get(cid) ?? "";
        skillsByCandidate.set(cid, text.trim().length > 0 ? skillsInText(text) : []);
      }
    }

    // -- Scores: every completed run for the window, rubric weights too. -
    const runRows = await db
      .select({
        candidateId: scores.candidateId,
        runId: scoringRuns.id,
        rubricVersion: scoringRuns.rubricVersion,
        startedAt: scoringRuns.startedAt,
        criterionKey: scores.criterionKey,
        score: scores.score,
      })
      .from(scores)
      .innerJoin(scoringRuns, eq(scores.runId, scoringRuns.id))
      .where(and(inArray(scores.candidateId, ids), eq(scoringRuns.status, "completed")))
      .orderBy(asc(scores.candidateId), desc(scoringRuns.startedAt));

    const rubricRows = await db
      .select({ jobId: rubrics.jobId, version: rubrics.version, criteria: rubrics.criteria })
      .from(rubrics)
      .innerJoin(jobs, eq(rubrics.jobId, jobs.id))
      .where(eq(jobs.orgId, orgId));

    // criteria jsonb mirrors the @hirelens/core Criterion shape.
    const criteriaByKey = new Map<string, Array<{ key: string; weight: number }>>();
    for (const r of rubricRows) {
      const raw = r.criteria as unknown;
      if (!Array.isArray(raw)) continue;
      const list: Array<{ key: string; weight: number }> = [];
      for (const x of raw) {
        if (typeof x !== "object" || x === null) continue;
        const rec = x as Record<string, unknown>;
        if (typeof rec["key"] === "string" && typeof rec["weight"] === "number") {
          list.push({ key: rec["key"], weight: rec["weight"] });
        }
      }
      criteriaByKey.set(`${r.jobId}:${r.version}`, list);
    }

    // Latest completed run per candidate; per-run criterion scores.
    const latestRun = new Map<string, { runId: string; version: number; startedAt: Date }>();
    const scoresByRun = new Map<string, Map<string, number>>();
    for (const r of runRows) {
      const perCriterion = scoresByRun.get(r.runId) ?? new Map<string, number>();
      perCriterion.set(r.criterionKey, r.score);
      scoresByRun.set(r.runId, perCriterion);
      const prev = latestRun.get(r.candidateId);
      if (!prev || r.startedAt > prev.startedAt) {
        latestRun.set(r.candidateId, {
          runId: r.runId,
          version: r.rubricVersion,
          startedAt: r.startedAt,
        });
      }
    }

    const statsByCandidate = new Map<string, MatchStats>();
    for (const r of rows) {
      const run = latestRun.get(r.id);
      if (!run) continue;
      const criteria = criteriaByKey.get(`${r.jobId}:${run.version}`);
      const perCriterion = scoresByRun.get(run.runId);
      if (!criteria || !perCriterion) continue;
      let sum = 0;
      let weightSum = 0;
      for (const cr of criteria) {
        const s = perCriterion.get(cr.key);
        if (s === undefined) continue;
        sum += cr.weight * s;
        weightSum += cr.weight;
      }
      statsByCandidate.set(r.id, {
        overall: weightSum === 0 ? 0 : Math.round((sum / weightSum) * 20),
        rubricVersion: run.version,
        runId: run.runId,
      });
    }

    // -- Facets over the whole window (independent of active filters). ---
    const stageFacets: Record<string, number> = {};
    const skillFacet = new Map<string, number>();
    for (const r of rows) {
      if (r.stage) stageFacets[r.stage] = (stageFacets[r.stage] ?? 0) + 1;
      for (const s of skillsByCandidate.get(r.id) ?? []) {
        skillFacet.set(s, (skillFacet.get(s) ?? 0) + 1);
      }
    }
    const skillFacets = [...skillFacet.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([skill, n]) => ({ skill, count: n }));

    // -- Apply skill + min-score filters, then paginate the result. ------
    const label = (key: string | null): string | null =>
      blind ? null : (labelFromFileKey(key) ?? null);

    const filtered = rows.filter((r) => {
      if (skillsFilter.length > 0) {
        const hay = new Set((skillsByCandidate.get(r.id) ?? []).map((s) => s.toLowerCase()));
        if (!skillsFilter.some((f) => hay.has(f))) return false;
      }
      if (minScore !== null) {
        const stats = statsByCandidate.get(r.id);
        if (!stats || stats.overall < minScore) return false;
      }
      return true;
    });

    const total = filtered.length;
    const out = filtered.slice((page - 1) * pageSize, page * pageSize).map((r) => {
      const stats = statsByCandidate.get(r.id) ?? null;
      return {
        id: r.id,
        jobId: r.jobId,
        jobTitle: r.jobTitle,
        label: label(r.sourceFileKey),
        contactEmail: blind ? null : r.contactEmail,
        contactPhone: blind ? null : r.contactPhone,
        language: r.language,
        createdAt: r.createdAt,
        stage: r.stage,
        skills: skillsByCandidate.get(r.id) ?? [],
        overall: stats?.overall ?? null,
        rubricVersion: stats?.rubricVersion ?? null,
        runId: stats?.runId ?? null,
      };
    });

    return c.json({
      ok: true,
      candidates: out,
      total,
      page,
      pageSize,
      facets: { stages: stageFacets, skills: skillFacets },
    });
  });

  /**
   * POST /api/talent-pool/shortlist — organize rediscovered people into
   * lightweight recruiter lists (v1.4). The shortlist is a decision row on
   * the candidate's own job with the required reason, so it lands in the
   * same hash-chained audit trail as every other decision and appears in
   * the bias audit and analytics.
   */
  routes.post("/talent-pool/shortlist", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");

    let body: { candidateId?: string; reason?: string };
    try {
      body = (await c.req.json()) as { candidateId?: string; reason?: string };
    } catch {
      return c.json({ ok: false, error: "invalid_body" }, 400);
    }
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : "Rediscovered from the talent pool";
    if (!candidateId) return c.json({ ok: false, error: "invalid_body" }, 400);

    // The candidate must belong to a job in the caller's org.
    const [row] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .innerJoin(jobs, eq(candidates.jobId, jobs.id))
      .where(and(eq(candidates.id, candidateId), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    await db.insert(decisions).values({
      candidateId,
      stage: "shortlisted",
      reason,
      decidedBy: auth.userId,
    });

    return c.json({ ok: true }, 201);
  });

  /**
   * POST /api/talent-pool/add-to-job — enroll a rediscovered candidate
   * into another job in the org. The candidate's stored original file
   * re-runs the real ingest pipeline into the target job — parse,
   * per-job hash dedupe, ATS format check, semantic index — so the copy
   * is a first-class candidate everywhere (review queue, scoring, bias
   * audits), not a pointer into someone else's pipeline. Dedupe means
   * re-adding someone who is already on the target job is a no-op, not
   * an error. The action is audited with a link back to the source
   * candidate so the paper trail shows where the person came from.
   */
  routes.post("/talent-pool/add-to-job", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");

    let body: { candidateId?: string; jobId?: string; reason?: string };
    try {
      body = (await c.req.json()) as { candidateId?: string; jobId?: string; reason?: string };
    } catch {
      return c.json({ ok: false, error: "invalid_body" }, 400);
    }
    const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : "Added from the talent pool";
    if (!candidateId || !jobId) return c.json({ ok: false, error: "invalid_body" }, 400);

    // Source candidate must belong to a job in the caller's org.
    const [source] = await db
      .select({
        id: candidates.id,
        jobId: candidates.jobId,
        sourceFileKey: candidates.sourceFileKey,
      })
      .from(candidates)
      .innerJoin(jobs, eq(candidates.jobId, jobs.id))
      .where(and(eq(candidates.id, candidateId), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!source) return c.json({ ok: false, error: "not_found" }, 404);

    // Target job must exist in the caller's org and accept candidates.
    const [target] = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!target) return c.json({ ok: false, error: "not_found" }, 404);
    if (target.status === "closed") {
      return c.json(
        {
          ok: false,
          error: "job_closed",
          message: "Closed jobs don't accept new candidates — reopen it first.",
        },
        409,
      );
    }

    // No stored original file → no re-ingest. This happens only for rows
    // created before file storage shipped (text-only documents).
    const [doc] = await db
      .select({ fileBytes: documents.fileBytes })
      .from(documents)
      .where(eq(documents.candidateId, candidateId))
      .limit(1);
    if (!doc?.fileBytes) {
      return c.json(
        {
          ok: false,
          error: "file_unavailable",
          message: "The original resume file wasn't stored for this candidate.",
        },
        404,
      );
    }

    const bytes = new Uint8Array(Buffer.from(doc.fileBytes, "base64"));
    const filename = source.sourceFileKey ?? "resume";
    try {
      const result = await ingestBytes(db, { jobId: target.id, filename, bytes }, c.get("indexer"));
      if (result.status === "duplicate") {
        return c.json({
          ok: true,
          status: "duplicate",
          candidateId: result.candidateId,
          message: "Already a candidate on this job.",
        });
      }
      await appendAudit(db, {
        orgId: auth.orgId,
        actorId: auth.userId,
        action: "candidate.added_to_job",
        payload: {
          jobId: target.id,
          candidateId: result.candidateId,
          sourceJobId: source.jobId,
          sourceCandidateId: source.id,
          reason,
        },
      });
      return c.json(
        { ok: true, status: "created", candidateId: result.candidateId, jobId: target.id },
        201,
      );
    } catch (err) {
      // Same typed handling as the upload route: the source document was
      // readable when it was ingested, so these are edge cases from
      // storage drift — still report as client-input problems.
      const code = (err as { code?: string })?.code;
      if (code === "LOW_INFORMATION" || code === "EMPTY_FILE" || code === "UNSUPPORTED_FORMAT") {
        return c.json(
          {
            ok: false,
            error: "unreadable_document",
            message:
              err instanceof Error && err.message
                ? `${filename}: ${err.message.toLowerCase()}`
                : `${filename}: could not re-read this document`,
          },
          422,
        );
      }
      throw err;
    }
  });

  return routes;
}
