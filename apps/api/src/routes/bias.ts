import { biasAudit, type GroupOutcome } from "@hirelens/core";
import { candidates, decisions, demographics } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/**
 * Groups we aggregate over. Self-reported demographics are free-form; the
 * audit normalizes the declared dimension's values into these buckets plus
 * "undisclosed". The dimension itself is configurable per report request
 * (e.g. "gender", "race_ethnicity").
 */
const GroupValueSchema = z.string().trim().min(1).max(64);

const SelfReportSchema = z.object({
  dimension: GroupValueSchema,
  value: GroupValueSchema,
});

/** PUT /candidates/:cid/demographics — candidate's own opt-in self-report. */
export function demographicsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.put("/:candidateId/demographics", async (c) => {
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

    const parsed = SelfReportSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    // Merge into the self-reported map, keyed by dimension.
    const [existing] = await db
      .select()
      .from(demographics)
      .where(eq(demographics.candidateId, candidateId))
      .limit(1);

    const merged: Record<string, unknown> = {
      ...(existing?.selfReported ?? {}),
      [parsed.data.dimension]: parsed.data.value,
    };

    await db
      .insert(demographics)
      .values({ candidateId, selfReported: merged })
      .onConflictDoUpdate({
        target: demographics.candidateId,
        set: { selfReported: merged, reportedAt: new Date() },
      });

    return c.json({ ok: true, selfReported: merged });
  });

  return routes;
}

const AuditRequestSchema = z.object({
  dimension: GroupValueSchema,
  /** Stage(s) that count as "selected". Defaults to shortlisted+advanced. */
  selectedStages: z
    .array(z.enum(["shortlisted", "advanced", "rejected", "new"]))
    .min(1)
    .default(["shortlisted", "advanced"]),
});

/**
 * GET/POST — bias audit report for the job. POST carries the dimension
 * (kept out of the URL to avoid leaking demographic dimension names into
 * logs). Reads the latest review table, joins self-reported demographics,
 * and computes the adverse-impact report. Viewer role is enough — audits
 * are for oversight.
 */
export function biasAuditRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/", requireAuth(), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const parsed = AuditRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);
    const { dimension, selectedStages } = parsed.data;

    // Candidates for this job with their latest stage.
    const jobCandidates = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.jobId, job.id));

    if (jobCandidates.length === 0) {
      return c.json({ ok: true, audit: null, message: "no_candidates" });
    }

    const ids = jobCandidates.map((r) => r.id);
    const demoRows = await db.select().from(demographics);
    const demoByCandidate = new Map(
      demoRows
        .filter((d) => ids.includes(d.candidateId))
        .map((d) => [d.candidateId, d.selfReported]),
    );

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
      if (ids.includes(d.candidateId)) latestStage.set(d.candidateId, d.stage);
    }

    // Group outcomes: everyone considered; selected = latest stage in set.
    const groups = new Map<string, GroupOutcome>();
    for (const id of ids) {
      const selfReported = demoByCandidate.get(id);
      const raw = selfReported?.[dimension];
      const group = typeof raw === "string" && raw.length > 0 ? raw : "undisclosed";
      const current = groups.get(group) ?? { group, considered: 0, selected: 0 };
      current.considered += 1;
      const stage = latestStage.get(id);
      if (stage !== undefined && selectedStages.includes(stage as "shortlisted")) {
        current.selected += 1;
      }
      groups.set(group, current);
    }

    const audit = biasAudit([...groups.values()]);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "bias_audit.generated",
      payload: { jobId: job.id, dimension, selectedStages, allPass: audit.allPass },
    });

    return c.json({
      ok: true,
      dimension,
      selectedStages,
      candidatesConsidered: ids.length,
      withDemographics: demoByCandidate.size,
      audit,
      disclaimer:
        "Statistical screening metrics, not a legal conclusion. HireLens helps you meet audit obligations; it does not make you compliant.",
    });
  });

  return routes;
}
