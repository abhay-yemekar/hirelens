/**
 * Wave 3 — Team & Sharing.
 *
 * Share links: a public, read-only scored report behind an opaque token.
 * The token is the only credential; revocation is instant; the report
 * exposes scores/rationales/evidence excerpts but never contact info,
 * demographics, or resume files.
 *
 * Audit export: the hash-chained audit log for one job as CSV, with a
 * per-row recomputed linkage hash so a compliance reviewer can verify
 * the chain outside the product.
 */

import { randomBytes } from "node:crypto";
import { hashLink } from "@hirelens/core";
import { auditLog, jobs, scoringRuns, shareLinks } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";
import { runDetail } from "./scoring.js";

const CreateShareSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

/** csv field escape: quotes double, whole field wrapped when needed. */
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Sharing routes, mounted at /jobs/:jobId (auth-scoped CRUD) — plus the
 * public token endpoint mounted separately on the bare app. */
export function sharingRoutes() {
  const routes = new Hono<AppEnv>();

  /** List the job's share links (newest first). Viewer is enough. */
  routes.get("/share", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const links = await db
      .select({
        id: shareLinks.id,
        title: shareLinks.title,
        revokedAt: shareLinks.revokedAt,
        createdAt: shareLinks.createdAt,
        readCount: shareLinks.readCount,
      })
      .from(shareLinks)
      .where(eq(shareLinks.jobId, job.id))
      .orderBy(desc(shareLinks.createdAt));

    return c.json({ ok: true, links });
  });

  /** Create a share link (recruiter+). Returns the token once — the DB is
   * the only place it lives afterwards. */
  routes.post("/share", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const parsed = CreateShareSchema.safeParse(await readJson(c).catch(() => ({})));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    const token = randomBytes(32).toString("base64url");
    const inserted = await db
      .insert(shareLinks)
      .values({
        jobId: job.id,
        token,
        title: parsed.data.title ?? null,
        createdBy: auth.userId,
      })
      .returning({ id: shareLinks.id, createdAt: shareLinks.createdAt });
    const link = inserted[0];
    if (!link) return c.json({ ok: false, error: "internal_error" }, 500);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "share.created",
      payload: { jobId: job.id, linkId: link.id },
    });

    return c.json({ ok: true, link: { id: link.id, token, createdAt: link.createdAt } }, 201);
  });

  /** Revoke a share link — takes effect on the next request. */
  routes.delete("/share/:linkId", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const [row] = await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.id, c.req.param("linkId") ?? ""), eq(shareLinks.jobId, job.id)))
      .returning({ id: shareLinks.id });

    if (!row) return c.json({ ok: false, error: "not_found" }, 404);

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "share.revoked",
      payload: { jobId: job.id, linkId: row.id },
    });

    return c.json({ ok: true });
  });

  return routes;
}

/** Public (token-gated) report — mounted on the bare app at /api/share/:token.
 * Deliberately outside requireAuth: the token IS the credential. */
export function publicShareRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/share/:token", async (c) => {
    const db = c.get("db");
    const token = c.req.param("token") ?? "";

    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    if (!link) return c.json({ ok: false, error: "not_found" }, 404);
    if (link.revokedAt) {
      return c.json({ ok: false, error: "revoked" }, 410);
    }

    // The snapshot: the latest completed run, rendered through the same
    // read-model the owners see — but only the shareable projection of it
    // (labels, overalls, criterion scores + rationale; evidence offsets
    // stay private since the resume text itself is not published).
    const [job] = await db.select().from(jobs).where(eq(jobs.id, link.jobId)).limit(1);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const [latestRun] = await db
      .select({ id: scoringRuns.id })
      .from(scoringRuns)
      .where(and(eq(scoringRuns.jobId, job.id), eq(scoringRuns.status, "completed")))
      .orderBy(desc(scoringRuns.rubricVersion), desc(scoringRuns.startedAt))
      .limit(1);
    if (!latestRun) {
      return c.json(
        { ok: false, error: "no_report", message: "Nothing scored yet for this job." },
        404,
      );
    }

    const detail = await runDetail(db, latestRun.id);
    if (!detail) return c.json({ ok: false, error: "not_found" }, 404);

    const shareable = detail.candidates.map((c) => ({
      candidateId: c.candidateId,
      label: c.label,
      overall: c.overall,
      criteria: c.criteria.map((s) => ({
        criterionKey: s.criterionKey,
        score: s.score,
        rationale: s.rationale,
      })),
    }));

    // Count the read for the owner's visibility (best-effort).
    await db
      .update(shareLinks)
      .set({ readCount: sql`coalesce(${shareLinks.readCount}, 0) + 1` })
      .where(eq(shareLinks.id, link.id));

    return c.json({
      ok: true,
      report: {
        jobTitle: job.title,
        linkTitle: link.title,
        rubricVersion: detail.run.rubricVersion,
        modelId: detail.run.modelId,
        finishedAt: detail.run.finishedAt,
        candidates: shareable,
      },
    });
  });

  return routes;
}

/** Hash-chain-verified audit CSV for one job (viewer+). */
export function auditExportRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/audit-export.csv", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, auth.orgId))
      .orderBy(auditLog.seq);

    // Keep only this job's entries: the payload carries jobId on job-scoped actions.
    const jobRows = rows.filter((r) => r.payload["jobId"] === job.id);

    const header = "seq,at,action,actor,chain_valid,prev_hash,hash,payload";
    const lines = jobRows.map((r) => {
      const expected = hashLink({
        action: r.action,
        payload: r.payload,
        prevHash: r.prevHash,
        createdAt: r.createdAt,
      });
      const valid = expected === r.hash;
      return [
        r.seq,
        r.createdAt.toISOString(),
        r.action,
        r.actorId ?? "",
        valid ? "yes" : "NO",
        r.prevHash,
        r.hash,
        JSON.stringify(r.payload),
      ]
        .map(csvField)
        .join(",");
    });

    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="hirelens-audit-${job.id}.csv"`);
    return c.body([header, ...lines].join("\n"));
  });

  return routes;
}
