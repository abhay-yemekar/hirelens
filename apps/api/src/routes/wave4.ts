/**
 * Wave 4 — interview kits + candidate portal.
 *
 * Interview kits: a deterministic, printable debrief pack derived from the
 * run's rubric anchors and the candidate's actual evidence — JSON for
 * machines, standalone HTML for print→PDF. No LLM call: the rubric's
 * anchored scale IS the question bank.
 *
 * Candidate portal: a per-candidate token link the candidate can open
 * (no account) to submit an OPT-IN demographics self-report — the same
 * data the bias audit consumes. The token is the only credential (share-
 * link pattern): shown once, revocable, one-shot after submission.
 */

import { randomBytes } from "node:crypto";
import { buildInterviewKit, renderKitHtml } from "@hirelens/core";
import { candidates, demographics, jobs, portalLinks, rubrics } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import { labelFromFileKey } from "../labels.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";
import { runDetail } from "./scoring.js";

/** Serialized rubric payload → criteria array (same shape as scoring.ts). */
function criteriaOf(payload: Record<string, unknown>) {
  const c = payload["criteria"];
  return Array.isArray(c) ? (c as never[]) : [];
}

/**
 * GET /runs/:runId/interview-kit.json?candidate=<id> — structured kit.
 * GET /runs/:runId/interview-kit.html?candidate=<id> — printable pack.
 * Viewer role is enough: kits are read-only projections of existing data.
 */
export function interviewKitRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  async function buildKit(
    db: AppEnv["Variables"]["db"],
    jobId: string,
    runId: string,
    candidateId: string | undefined,
  ): Promise<{ kit: ReturnType<typeof buildInterviewKit> | null; error: string | null }> {
    const detail = await runDetail(db, runId);
    if (!detail || detail.run.jobId !== jobId) return { kit: null, error: "not_found" };

    const target = candidateId
      ? detail.candidates.find((c) => c.candidateId === candidateId)
      : detail.candidates[0];
    if (!target) return { kit: null, error: "no_candidates" };

    const [rubricRow] = await db
      .select({ payload: rubrics.payload })
      .from(rubrics)
      .where(and(eq(rubrics.jobId, jobId), eq(rubrics.version, detail.run.rubricVersion)))
      .limit(1);
    if (!rubricRow) return { kit: null, error: "no_rubric" };

    const [candidate] = await db
      .select({ fileKey: candidates.sourceFileKey })
      .from(candidates)
      .where(eq(candidates.id, target.candidateId))
      .limit(1);

    const kit = buildInterviewKit({
      criteria: criteriaOf(rubricRow.payload),
      rubricVersion: detail.run.rubricVersion,
      rubricTitle: "Rubric",
      modelId: detail.run.modelId,
      runId: detail.run.id,
      candidateLabel: labelFromFileKey(candidate?.fileKey ?? null) ?? target.label ?? "Candidate",
      overall: target.overall,
      scored: target.criteria.map((s) => ({
        criterionKey: s.criterionKey,
        score: s.score,
        confidence: s.confidence,
        rationale: s.rationale,
        overriddenBy: s.overriddenBy,
        evidence: s.evidence.map((e) => ({
          startOffset: e.startOffset,
          endOffset: e.endOffset,
          quotedText: e.quotedText,
        })),
      })),
    });
    return { kit, error: null };
  }

  routes.get("/runs/:runId/interview-kit.json", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const { kit, error } = await buildKit(
      db,
      job.id,
      c.req.param("runId") ?? "",
      c.req.query("candidate") || undefined,
    );
    if (error === "not_found" || !kit)
      return c.json({ ok: false, error: error ?? "not_found" }, 404);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "interview_kit.exported",
      payload: {
        jobId: job.id,
        runId: c.req.param("runId"),
        candidateId: kit.runId,
        criteriaCount: kit.criteria.length,
      },
    });
    return c.json({ ok: true, kit });
  });

  routes.get("/runs/:runId/interview-kit.html", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const { kit, error } = await buildKit(
      db,
      job.id,
      c.req.param("runId") ?? "",
      c.req.query("candidate") || undefined,
    );
    if (error === "not_found" || !kit)
      return c.json({ ok: false, error: error ?? "not_found" }, 404);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "interview_kit.exported",
      payload: { jobId: job.id, runId: c.req.param("runId"), format: "html" },
    });
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header(
      "Content-Disposition",
      `inline; filename="interview-kit-${kit.candidateLabel.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.html"`,
    );
    return c.body(renderKitHtml(kit));
  });

  return routes;
}

const SelfReportSchema = z.object({
  dimension: z.string().trim().min(1).max(64),
  value: z.string().trim().min(1).max(64),
});

/** Portal CRUD (recruiter+), mounted at /jobs/:jobId/portal. */
export function portalRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** List portal links for the job's candidates. */
  routes.get("/", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const rows = await db
      .select({
        id: portalLinks.id,
        candidateId: portalLinks.candidateId,
        submittedAt: portalLinks.submittedAt,
        revokedAt: portalLinks.revokedAt,
        createdAt: portalLinks.createdAt,
      })
      .from(portalLinks)
      .innerJoin(candidates, eq(candidates.id, portalLinks.candidateId))
      .where(eq(candidates.jobId, job.id))
      .orderBy(desc(portalLinks.createdAt));
    return c.json({ ok: true, links: rows });
  });

  /** Create a portal link for one candidate. Token shown once. */
  routes.post("/:candidateId", requireAuth(ROLE_MIN.edit), async (c) => {
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

    // Supersede any earlier active link for this candidate.
    await db
      .update(portalLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(portalLinks.candidateId, candidateId), isNull(portalLinks.revokedAt)));

    const token = randomBytes(32).toString("base64url");
    const inserted = await db
      .insert(portalLinks)
      .values({ candidateId, token, createdBy: auth.userId })
      .returning({ id: portalLinks.id, createdAt: portalLinks.createdAt });
    const link = inserted[0];
    if (!link) return c.json({ ok: false, error: "internal_error" }, 500);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "portal.created",
      payload: { jobId: job.id, candidateId, linkId: link.id },
    });

    return c.json({ ok: true, link: { id: link.id, token, createdAt: link.createdAt } }, 201);
  });

  /** Revoke a portal link (job-scoped, like share links). */
  routes.delete("/:linkId", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    // Resolve the link through the job's candidates — org scoping in one step.
    const jobCandidates = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.jobId, job.id));
    const ids = jobCandidates.map((r) => r.id);
    const [fallback] = await db
      .update(portalLinks)
      .set({ revokedAt: new Date() })
      .where(eq(portalLinks.id, c.req.param("linkId") ?? ""))
      .returning({ id: portalLinks.id, candidateId: portalLinks.candidateId });
    if (!fallback || !ids.includes(fallback.candidateId)) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "portal.revoked",
      payload: { jobId: job.id, linkId: fallback.id },
    });
    return c.json({ ok: true });
  });

  return routes;
}

/** Public (token-gated) portal — mounted on the bare app at /api/portal/:token. */
export function publicPortalRoutes() {
  const routes = new Hono<AppEnv>();

  /** What the candidate sees: job title, nothing personal, dimensions we ask for. */
  routes.get("/portal/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token") ?? "";
    const [link] = await db.select().from(portalLinks).where(eq(portalLinks.token, token)).limit(1);
    if (!link) return c.json({ ok: false, error: "not_found" }, 404);
    if (link.revokedAt) return c.json({ ok: false, error: "revoked" }, 410);
    if (link.submittedAt) return c.json({ ok: false, error: "already_submitted" }, 409);

    const [candidate] = await db
      .select({ jobId: candidates.jobId })
      .from(candidates)
      .where(eq(candidates.id, link.candidateId))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    return c.json({
      ok: true,
      invitation: {
        jobTitle: job.title,
        dimensions: ["gender", "race_ethnicity"],
        note: "Opt-in only. Your answers feed aggregate bias statistics and are never shown with your name to hiring staff or on any shared report. You may skip any question.",
      },
    });
  });

  /** Submit the self-report. One-shot: the link is consumed. */
  routes.post("/portal/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token") ?? "";
    const [link] = await db.select().from(portalLinks).where(eq(portalLinks.token, token)).limit(1);
    if (!link) return c.json({ ok: false, error: "not_found" }, 404);
    if (link.revokedAt) return c.json({ ok: false, error: "revoked" }, 410);
    if (link.submittedAt) return c.json({ ok: false, error: "already_submitted" }, 409);

    const parsed = SelfReportSchema.safeParse(await readJson(c).catch(() => null));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    const [candidate] = await db
      .select({ id: candidates.id, jobId: candidates.jobId })
      .from(candidates)
      .where(eq(candidates.id, link.candidateId))
      .limit(1);
    if (!candidate) return c.json({ ok: false, error: "not_found" }, 404);
    const [job] = await db
      .select({ orgId: jobs.orgId })
      .from(jobs)
      .where(eq(jobs.id, candidate.jobId))
      .limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const [existing] = await db
      .select()
      .from(demographics)
      .where(eq(demographics.candidateId, candidate.id))
      .limit(1);
    const merged: Record<string, unknown> = {
      ...(existing?.selfReported ?? {}),
      [parsed.data.dimension]: parsed.data.value,
    };
    await db
      .insert(demographics)
      .values({ candidateId: candidate.id, selfReported: merged })
      .onConflictDoUpdate({
        target: demographics.candidateId,
        set: { selfReported: merged, reportedAt: new Date() },
      });

    await db
      .update(portalLinks)
      .set({ submittedAt: new Date() })
      .where(eq(portalLinks.id, link.id));

    await appendAudit(db, {
      orgId: job.orgId,
      action: "portal.submitted",
      payload: {
        jobId: candidate.jobId,
        candidateId: candidate.id,
        dimension: parsed.data.dimension,
      },
    });

    return c.json({ ok: true, message: "Thank you — your response was recorded." });
  });

  return routes;
}
