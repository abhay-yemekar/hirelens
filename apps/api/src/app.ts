import type { LanguageModel } from "@hirelens/core";
import { ExtractionError } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { auth } from "@hirelens/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { requireAuth } from "./auth.js";
import { ApiInputError } from "./errors.js";
import { createIndexer, type HireLensIndexer } from "./indexing.js";
import { requestLogging } from "./middleware.js";
import { captureException } from "./observability.js";
import { openApiDocument } from "./openapi.js";
import { biasAuditRoutes, demographicsRoutes } from "./routes/bias.js";
import { candidateReadRoutes } from "./routes/candidates-read.js";
import { jobsRoutes } from "./routes/jobs.js";
import { reviewRoutes } from "./routes/review.js";
import { rubricsRoutes } from "./routes/rubrics.js";
import { scoringRoutes } from "./routes/scoring.js";
import { searchRoutes } from "./routes/search.js";
import { auditExportRoutes, publicShareRoutes, sharingRoutes } from "./routes/sharing.js";
import { interviewKitRoutes, portalRoutes, publicPortalRoutes } from "./routes/wave4.js";
import type { AppEnv } from "./types.js";

export interface AppDeps {
  db: Database;
  llm: LanguageModel | null;
  /** Semantic indexer; null/omitted → search falls back to keyword mode. */
  indexer?: HireLensIndexer | null;
}

/** Body-size caps: tight for JSON, larger for resume/zip uploads (§Day 19). */
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024; // job descriptions cap at ~100k chars
const MAX_RESUME_UPLOAD_BYTES = 16 * 1024 * 1024; // single resume + multipart overhead
const MAX_ZIP_UPLOAD_BYTES = 64 * 1024 * 1024; // zip of resumes (expanded total is capped in core)

function tooLarge(c: Context, maxBytes: number) {
  return c.json(
    {
      ok: false as const,
      error: "payload_too_large",
      message: `Request body exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit`,
    },
    413,
  );
}

/**
 * Build the API app with injected dependencies. No side effects: tests
 * import this freely; main.ts performs the environment bootstrap.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use(trimTrailingSlash());
  app.use(secureHeaders());
  app.use(requestLogging());
  // Reject oversized bodies before parsing anywhere else (DoS guard).
  app.use("*", async (c, next) => {
    const path = c.req.path;
    const isZipUpload = path.endsWith("/candidates/zip");
    const isResumeUpload = path.endsWith("/candidates") && c.req.method === "POST";
    const maxBytes = isZipUpload
      ? MAX_ZIP_UPLOAD_BYTES
      : isResumeUpload
        ? MAX_RESUME_UPLOAD_BYTES
        : MAX_JSON_BODY_BYTES;
    return bodyLimit({
      maxSize: maxBytes,
      onError: (c) => tooLarge(c, maxBytes),
    })(c, next);
  });
  // The web app runs on a different origin in dev (5173/3001) — allow
  // credentialed cross-origin calls from configured origins only.
  app.use(
    "*",
    cors({
      origin: (origin) =>
        (
          process.env["CORS_ORIGINS"] ??
          "http://localhost:3000,http://localhost:3001,http://localhost:5173"
        )
          .split(",")
          .map((s) => s.trim())
          .includes(origin)
          ? origin
          : null,
      credentials: true,
    }),
  );

  // Attach per-request db + model + indexer.
  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    c.set("model", deps.llm);
    c.set("indexer", deps.indexer ?? null);
    await next();
  });

  // Resolve the better-auth session (if any) for downstream middleware.
  // Built via hono's typed header API (not c.req.raw) so the type stays
  // correct under every @types/node / lib.dom resolution Vercel might
  // hoist — raw Request typings have caused TS2339 there.
  app.use("*", async (c, next) => {
    const payload = await auth.api.getSession({ headers: new Headers(c.req.header()) });
    c.set("session", (payload as AppEnv["Variables"]["session"]) ?? null);
    await next();
  });

  // Better Auth handles its own routes (sign-up/sign-in/session/org).
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  // Health check — public, no DB round-trip.
  app.get("/api/health", (c) =>
    c.json({ ok: true as const, service: "hirelens-api", version: "0.1.0" }),
  );

  // Public API contract (public document; auth still governs the endpoints it describes).
  app.get("/api/openapi.json", (c) => c.json(openApiDocument));

  // Public, token-gated share report — mounted BEFORE the protected API so
  // the token is the only credential (requireAuth's /api/* middleware must
  // not intercept these reads).
  app.route("/api", publicShareRoutes());
  app.route("/api", publicPortalRoutes());

  // Authenticated, org-scoped API surface.
  const protectedApi = new Hono<AppEnv>();
  protectedApi.use("*", requireAuth());
  protectedApi.route("/jobs/:jobId/rubrics", rubricsRoutes());
  protectedApi.route("/jobs/:jobId/candidates", candidateReadRoutes());
  protectedApi.route("/jobs/:jobId/demographics", demographicsRoutes());
  protectedApi.route("/jobs/:jobId", scoringRoutes());
  protectedApi.route("/jobs/:jobId", reviewRoutes());
  protectedApi.route("/jobs/:jobId/bias-audit", biasAuditRoutes());
  protectedApi.route("/jobs/:jobId", searchRoutes());
  protectedApi.route("/jobs/:jobId", sharingRoutes());
  protectedApi.route("/jobs/:jobId/portal", portalRoutes());
  protectedApi.route("/jobs/:jobId", interviewKitRoutes());
  protectedApi.route("/jobs/:jobId", auditExportRoutes());
  protectedApi.route("/jobs", jobsRoutes());
  app.route("/api", protectedApi);

  app.onError((err, c) => {
    if (err instanceof ApiInputError) {
      return c.json({ ok: false, error: err.code, message: err.message }, err.status);
    }
    if (err instanceof ExtractionError) {
      return c.json({ ok: false, error: "unreadable_document", message: err.message }, 422);
    }
    captureException(err, {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
    });
    return c.json({ ok: false, error: "internal_error" }, 500);
  });

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  return app;
}
