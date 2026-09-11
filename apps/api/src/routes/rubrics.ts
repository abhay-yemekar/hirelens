import { deriveRubric, parseRubric, serializeRubric } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { rubrics } from "@hirelens/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

const CreateRubricSchema = z.object({
  /** Full rubric JSON (validated import path via parseRubric). */
  rubric: z.unknown(),
});

/** Next sequential rubric version for a job. */
async function nextVersion(db: Database, jobId: string): Promise<number> {
  const [last] = await db
    .select({ v: rubrics.version })
    .from(rubrics)
    .where(eq(rubrics.jobId, jobId))
    .orderBy(desc(rubrics.version))
    .limit(1);
  return (last?.v ?? 0) + 1;
}

/** Rubrics routes, mounted at /api/jobs/:jobId/rubrics. Org-scoped. */
export function rubricsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** All versions for this job, newest first. */
  routes.get("/", async (c) => {
    const db = c.get("db");
    const job = await loadOrgJob(db, c.req.param("jobId"), c.get("auth").orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const rows = await db
      .select({
        id: rubrics.id,
        version: rubrics.version,
        payload: rubrics.payload,
        createdAt: rubrics.createdAt,
      })
      .from(rubrics)
      .where(eq(rubrics.jobId, job.id))
      .orderBy(desc(rubrics.version));
    return c.json({ ok: true, rubrics: rows });
  });

  /** One version. */
  routes.get("/:version", async (c) => {
    const db = c.get("db");
    const job = await loadOrgJob(db, c.req.param("jobId"), c.get("auth").orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ ok: false, error: "invalid_version" }, 400);
    }
    const [row] = await db
      .select()
      .from(rubrics)
      .where(and(eq(rubrics.jobId, job.id), eq(rubrics.version, version)))
      .limit(1);
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, rubric: row });
  });

  /** Manually create a new version (validated import path). */
  routes.post("/", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const parsed = CreateRubricSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    let criteria: unknown[];
    let payload: Record<string, unknown>;
    try {
      const rubric = parseRubric(JSON.stringify(parsed.data.rubric));
      criteria = rubric.criteria;
      payload = JSON.parse(serializeRubric(rubric)) as Record<string, unknown>;
    } catch {
      return c.json({ ok: false, error: "invalid_rubric" }, 400);
    }

    const version = await nextVersion(db, job.id);
    const [row] = await db
      .insert(rubrics)
      .values({ jobId: job.id, version, criteria, payload, createdBy: auth.userId })
      .returning({ id: rubrics.id, version: rubrics.version });
    return c.json({ ok: true, rubric: row }, 201);
  });

  /** LLM derivation: JD → new rubric version. Requires LLM config. */
  routes.post("/derive", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const model = c.get("model");
    if (!model) return c.json({ ok: false, error: "llm_not_configured" }, 503);

    const result = await deriveRubric(model, job.description);
    const version = await nextVersion(db, job.id);
    const [row] = await db
      .insert(rubrics)
      .values({
        jobId: job.id,
        version,
        criteria: result.rubric.criteria,
        payload: JSON.parse(serializeRubric(result.rubric)) as Record<string, unknown>,
        createdBy: auth.userId,
      })
      .returning({ id: rubrics.id, version: rubrics.version });
    return c.json({ ok: true, rubric: row, promptHash: result.audit.promptHash }, 201);
  });

  return routes;
}
