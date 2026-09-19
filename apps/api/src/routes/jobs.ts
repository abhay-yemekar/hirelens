import type { Database } from "@hirelens/db";
import { jobs } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";

const JOB_STATUSES = ["draft", "open", "closed"] as const;

const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(100_000),
  status: z.enum(JOB_STATUSES).default("draft"),
  blindReviewDefault: z.boolean().default(true),
});

const UpdateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(100_000).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  blindReviewDefault: z.boolean().optional(),
});

/** Load a job only if it belongs to the caller's org. */
export async function loadOrgJob(
  db: Database,
  id: string | undefined,
  orgId: string,
): Promise<{ id: string; orgId: string; description: string } | null> {
  if (id === undefined || id === "") return null;
  const [row] = await db
    .select({ id: jobs.id, orgId: jobs.orgId, description: jobs.description })
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** Jobs routes, mounted at /api/jobs. All queries are org-scoped. */
export function jobsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => {
    const db = c.get("db");
    // Hard cap on page size — the UI never asks for more (§Day 19).
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 100);
    const rows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.orgId, c.get("auth").orgId))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
    return c.json({ ok: true, jobs: rows });
  });

  routes.post("/", requireAuth(ROLE_MIN.edit), async (c) => {
    const parsed = CreateJobSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const db = c.get("db");
    const auth = c.get("auth");
    const [row] = await db
      .insert(jobs)
      .values({
        orgId: auth.orgId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        blindReviewDefault: parsed.data.blindReviewDefault,
        createdBy: auth.userId,
      })
      .returning();
    return c.json({ ok: true, job: row }, 201);
  });

  routes.get("/:id", async (c) => {
    const job = await loadOrgJob(c.get("db"), c.req.param("id"), c.get("auth").orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const [row] = await c.get("db").select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    return c.json({ ok: true, job: row });
  });

  routes.patch("/:id", requireAuth(ROLE_MIN.edit), async (c) => {
    const parsed = UpdateJobSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const job = await loadOrgJob(c.get("db"), c.req.param("id"), c.get("auth").orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const [row] = await c
      .get("db")
      .update(jobs)
      .set(parsed.data)
      .where(eq(jobs.id, job.id))
      .returning();
    await appendAudit(c.get("db"), {
      orgId: c.get("auth").orgId,
      actorId: c.get("auth").userId,
      action: "job.updated",
      payload: { jobId: job.id, fields: Object.keys(parsed.data) },
    });
    return c.json({ ok: true, job: row });
  });

  /**
   * Delete a job. Owner-only: candidates, scores, decisions, rubrics and
   * runs cascade via FK, but the append-only audit log records who deleted
   * what — the trail stays tamper-evident after the rows are gone.
   */
  routes.delete("/:id", requireAuth(ROLE_MIN.admin), async (c) => {
    const job = await loadOrgJob(c.get("db"), c.req.param("id"), c.get("auth").orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    await c.get("db").delete(jobs).where(eq(jobs.id, job.id));
    await appendAudit(c.get("db"), {
      orgId: c.get("auth").orgId,
      actorId: c.get("auth").userId,
      action: "job.deleted",
      payload: { jobId: job.id },
    });
    return c.json({ ok: true, deleted: job.id });
  });

  return routes;
}
