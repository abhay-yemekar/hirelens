/**
 * Scheduled bias audits (v1.2) — snapshots over time.
 *
 * A bias audit is a point-in-time reading; the value comes from watching
 * it move. This module:
 *  - POST /jobs/:jobId/audit-snapshots  — manual snapshot (viewer+)
 *  - GET  /jobs/:jobId/audit-snapshots  — trend for one job (viewer+)
 *  - POST /cron/audit-snapshots         — snapshot EVERY job in the org
 *    (all orgs), guarded by a shared secret (CRON_SECRET), no session —
 *    for Vercel Cron / GitHub Actions schedules / plain curl cron.
 *
 * Every snapshot is also appended to the hash-chained audit log
 * (action: bias_audit.scheduled) so tampering with history stays visible.
 */

import { biasAudit, type GroupOutcome } from "@hirelens/core";
import { biasAuditSnapshots, candidates, decisions, demographics, jobs } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";

const SNAPSHOT_DIMENSIONS = ["gender", "race_ethnicity", "age_band", "disability"] as const;

/** Take one snapshot for a job+dimension. Shared by cron and manual paths. */
async function takeSnapshot(
  db: AppEnv["Variables"]["db"],
  orgId: string,
  jobId: string,
  dimension: string,
  trigger: "scheduled" | "manual",
): Promise<{ allPass: boolean } | null> {
  const jobCandidates = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.jobId, jobId));
  if (jobCandidates.length === 0) return null;
  const ids = jobCandidates.map((r) => r.id);

  const demoRows = await db.select().from(demographics);
  const demoByCandidate = new Map(
    demoRows.filter((d) => ids.includes(d.candidateId)).map((d) => [d.candidateId, d.selfReported]),
  );

  const decisionRows = await db
    .select({ candidateId: decisions.candidateId, stage: decisions.stage })
    .from(decisions)
    .orderBy(decisions.decidedAt);
  const latestStage = new Map<string, string>();
  for (const d of decisionRows) {
    if (ids.includes(d.candidateId)) latestStage.set(d.candidateId, d.stage);
  }

  const groups = new Map<string, GroupOutcome>();
  for (const id of ids) {
    const selfReported = demoByCandidate.get(id);
    const raw = selfReported?.[dimension];
    const group = typeof raw === "string" && raw.length > 0 ? raw : "undisclosed";
    const current = groups.get(group) ?? { group, considered: 0, selected: 0 };
    current.considered += 1;
    const stage = latestStage.get(id);
    if (stage === "shortlisted" || stage === "advanced") current.selected += 1;
    groups.set(group, current);
  }

  const audit = biasAudit([...groups.values()]);

  await db.insert(biasAuditSnapshots).values({
    orgId,
    jobId,
    dimension,
    outcome: audit as unknown as Record<string, unknown>,
    allPass: audit.allPass ? "true" : "false",
    trigger,
  });

  return { allPass: audit.allPass };
}

/** Authenticated per-job routes (mounted under /jobs/:jobId). */
export function auditSnapshotRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** Trend for the dashboard: snapshots for this job, newest first. */
  routes.get("/audit-snapshots", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, c.req.param("jobId") ?? ""), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const rows = await db
      .select({
        id: biasAuditSnapshots.id,
        dimension: biasAuditSnapshots.dimension,
        allPass: biasAuditSnapshots.allPass,
        trigger: biasAuditSnapshots.trigger,
        outcome: biasAuditSnapshots.outcome,
        createdAt: biasAuditSnapshots.createdAt,
      })
      .from(biasAuditSnapshots)
      .where(eq(biasAuditSnapshots.jobId, job.id))
      .orderBy(desc(biasAuditSnapshots.createdAt))
      .limit(100);

    return c.json({ ok: true, snapshots: rows });
  });

  /** Manual "take a snapshot now" (same computation as the cron path). */
  routes.post("/audit-snapshots", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const [job] = await db
      .select({ id: jobs.id, orgId: jobs.orgId })
      .from(jobs)
      .where(and(eq(jobs.id, c.req.param("jobId") ?? ""), eq(jobs.orgId, auth.orgId)))
      .limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const body = await readJson(c).catch(() => ({}));
    const parsed = z
      .object({ dimension: z.enum(SNAPSHOT_DIMENSIONS).default("gender") })
      .safeParse(body ?? {});
    const dimension = parsed.success ? parsed.data.dimension : "gender";

    const result = await takeSnapshot(db, job.orgId, job.id, dimension, "manual");
    if (!result) return c.json({ ok: false, error: "no_candidates" }, 409);

    await appendAudit(db, {
      orgId: job.orgId,
      actorId: auth.userId,
      action: "bias_audit.scheduled",
      payload: { jobId: job.id, dimension, trigger: "manual", allPass: result.allPass },
    });

    return c.json({ ok: true, allPass: result.allPass }, 201);
  });

  return routes;
}

/** Cron route — mounted on the bare app; the secret is the credential. */
export function cronSnapshotRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/cron/audit-snapshots", async (c) => {
    const secret = process.env["CRON_SECRET"] ?? "";
    const provided = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    // No secret configured → endpoint disabled (fails closed).
    if (secret.length === 0 || provided !== secret) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    const db = c.get("db");
    const orgJobs = await db.select({ id: jobs.id, orgId: jobs.orgId }).from(jobs);
    const taken = [] as Array<{ jobId: string; dimension: string; allPass: boolean }>;
    for (const job of orgJobs) {
      for (const dimension of SNAPSHOT_DIMENSIONS) {
        const result = await takeSnapshot(db, job.orgId, job.id, dimension, "scheduled");
        if (result) {
          taken.push({ jobId: job.id, dimension, allPass: result.allPass });
          await appendAudit(db, {
            orgId: job.orgId,
            actorId: undefined,
            action: "bias_audit.scheduled",
            payload: { jobId: job.id, dimension, trigger: "scheduled", allPass: result.allPass },
          });
        }
      }
    }

    return c.json({ ok: true, snapshots: taken.length, results: taken });
  });

  return routes;
}
