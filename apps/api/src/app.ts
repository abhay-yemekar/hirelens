import type { LanguageModel } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { auth } from "@hirelens/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { requireAuth } from "./auth.js";
import { jobsRoutes } from "./routes/jobs.js";
import { rubricsRoutes } from "./routes/rubrics.js";
import type { AppEnv } from "./types.js";

export interface AppDeps {
  db: Database;
  llm: LanguageModel | null;
}

/**
 * Build the API app with injected dependencies. No side effects: tests
 * import this freely; main.ts performs the environment bootstrap.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(trimTrailingSlash());
  app.use(secureHeaders());

  // Attach per-request db + model.
  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("model", deps.llm);
    await next();
  });

  // Resolve the better-auth session (if any) for downstream middleware.
  app.use("*", async (c, next) => {
    const payload = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("session", (payload as AppEnv["Variables"]["session"]) ?? null);
    await next();
  });

  // Better Auth handles its own routes (sign-up/sign-in/session/org).
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Health check — public, no DB round-trip.
  app.get("/api/health", (c) =>
    c.json({ ok: true as const, service: "hirelens-api", version: "0.1.0" }),
  );

  // Authenticated, org-scoped API surface.
  const protectedApi = new Hono<AppEnv>();
  protectedApi.use("*", requireAuth());
  protectedApi.route("/jobs", jobsRoutes());
  protectedApi.route("/jobs/:jobId/rubrics", rubricsRoutes());
  app.route("/api", protectedApi);

  app.onError((err, c) => {
    console.error(err);
    return c.json({ ok: false, error: "internal_error" }, 500);
  });

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  return app;
}
