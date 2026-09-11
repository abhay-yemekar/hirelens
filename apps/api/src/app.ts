import type { LanguageModel } from "@hirelens/core";
import { ExtractionError } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { auth } from "@hirelens/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { requireAuth } from "./auth.js";
import { ApiInputError } from "./errors.js";
import { candidateReadRoutes } from "./routes/candidates-read.js";
import { jobsRoutes } from "./routes/jobs.js";
import { reviewRoutes } from "./routes/review.js";
import { rubricsRoutes } from "./routes/rubrics.js";
import { scoringRoutes } from "./routes/scoring.js";
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
  // The web app runs on a different origin in dev (5173/3001) — allow
  // credentialed cross-origin calls from configured origins only.
  app.use(
    "*",
    cors({
      origin: (origin) =>
        (process.env["CORS_ORIGINS"] ?? "http://localhost:3000,http://localhost:5173")
          .split(",")
          .map((s) => s.trim())
          .includes(origin)
          ? origin
          : null,
      credentials: true,
    }),
  );

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
  protectedApi.route("/jobs/:jobId/rubrics", rubricsRoutes());
  protectedApi.route("/jobs/:jobId/candidates", candidateReadRoutes());
  protectedApi.route("/jobs/:jobId", scoringRoutes());
  protectedApi.route("/jobs/:jobId", reviewRoutes());
  protectedApi.route("/jobs", jobsRoutes());
  app.route("/api", protectedApi);

  app.onError((err, c) => {
    if (err instanceof ApiInputError) {
      return c.json({ ok: false, error: err.code, message: err.message }, err.status);
    }
    if (err instanceof ExtractionError) {
      return c.json({ ok: false, error: "unreadable_document", message: err.message }, 422);
    }
    console.error(err);
    return c.json({ ok: false, error: "internal_error" }, 500);
  });

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  return app;
}
