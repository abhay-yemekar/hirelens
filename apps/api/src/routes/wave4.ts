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
import { buildInterviewKit, renderKitHtml } from "@candidlens/core";
import { candidates, demographics, jobs, portalLinks, rubrics } from "@candidlens/db";
import { appendAudit, appendAuditIn } from "@candidlens/orchestrator";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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

const SelfReportAnswerSchema = z.object({
  dimension: z.string().trim().min(1).max(64),
  value: z.string().trim().min(1).max(64),
});

/**
 * A portal submission carries every answer at once, because the first
 * accepted request uses up the link. The older one-answer body
 * `{ dimension, value }` is still accepted. Each dimension may appear once.
 */
const PortalSubmissionSchema = z
  .union([
    z.object({ answers: z.array(SelfReportAnswerSchema).min(1).max(10) }),
    SelfReportAnswerSchema.transform((answer) => ({ answers: [answer] })),
  ])
  .refine((s) => new Set(s.answers.map((a) => a.dimension)).size === s.answers.length);

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

    // Scope the write itself to this job's candidates: a link id from
    // another org matches no row, so nothing is revoked before the 404.
    const [revoked] = await db
      .update(portalLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(portalLinks.id, c.req.param("linkId") ?? ""),
          inArray(
            portalLinks.candidateId,
            db.select({ id: candidates.id }).from(candidates).where(eq(candidates.jobId, job.id)),
          ),
        ),
      )
      .returning({ id: portalLinks.id });
    if (!revoked) return c.json({ ok: false, error: "not_found" }, 404);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "portal.revoked",
      payload: { jobId: job.id, linkId: revoked.id },
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

  /**
   * Submit the self-report: every answer in one request. One-shot: the
   * link is claimed in the same transaction that stores the answers, so a
   * second submission, even one sent at the same moment, gets 409 and no
   * answer is half-saved.
   */
  routes.post("/portal/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token") ?? "";
    const [link] = await db.select().from(portalLinks).where(eq(portalLinks.token, token)).limit(1);
    if (!link) return c.json({ ok: false, error: "not_found" }, 404);
    if (link.revokedAt) return c.json({ ok: false, error: "revoked" }, 410);
    if (link.submittedAt) return c.json({ ok: false, error: "already_submitted" }, 409);

    const parsed = PortalSubmissionSchema.safeParse(await readJson(c).catch(() => null));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);
    const { answers } = parsed.data;

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

    const answered = Object.fromEntries(answers.map((a) => [a.dimension, a.value]));

    const recorded = await db.transaction(async (tx) => {
      // Claim the link first. Only one request can match an unused,
      // unrevoked link; any other finds nothing and writes nothing.
      const [claimed] = await tx
        .update(portalLinks)
        .set({ submittedAt: new Date() })
        .where(
          and(
            eq(portalLinks.id, link.id),
            isNull(portalLinks.submittedAt),
            isNull(portalLinks.revokedAt),
          ),
        )
        .returning({ id: portalLinks.id });
      if (!claimed) return false;

      // Merge per dimension in one statement: answers given before (on an
      // earlier link, or by a recruiter) stay unless this submission
      // replaces them.
      await tx
        .insert(demographics)
        .values({ candidateId: candidate.id, selfReported: answered })
        .onConflictDoUpdate({
          target: demographics.candidateId,
          set: {
            selfReported: sql`${demographics.selfReported} || excluded.self_reported`,
            reportedAt: new Date(),
          },
        });

      await appendAuditIn(tx, {
        orgId: job.orgId,
        action: "portal.submitted",
        // Dimension names only: the answers never enter the audit log.
        payload: {
          jobId: candidate.jobId,
          candidateId: candidate.id,
          dimensions: Object.keys(answered),
        },
      });
      return true;
    });
    if (!recorded) return c.json({ ok: false, error: "already_submitted" }, 409);

    return c.json({ ok: true, message: "Thank you — your response was recorded." });
  });

  return routes;
}
