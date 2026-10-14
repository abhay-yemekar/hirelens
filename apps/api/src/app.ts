import { randomUUID } from "node:crypto";
import type { LanguageModel } from "@hirelens/core";
import { ExtractionError } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { auth, MIGRATION_SNAPSHOT } from "@hirelens/db";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { trimTrailingSlash } from "hono/trailing-slash";
import { requireAuth } from "./auth.js";
import { ApiInputError } from "./errors.js";
import type { HireLensIndexer } from "./indexing.js";
import { isMissingTableError, sanitizeLlmConfigError } from "./llm-error.js";
import { requestLogging } from "./middleware.js";
import { compareMigrations } from "./migration-health.js";
import { captureException } from "./observability.js";
import { openApiDocument } from "./openapi.js";
import { aiContentRoutes } from "./routes/ai-content.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { atsWebhookRoutes } from "./routes/ats-webhook.js";
import { biasAuditRoutes, demographicsRoutes } from "./routes/bias.js";
import { candidateReportRoutes, publicCandidateReportRoutes } from "./routes/candidate-report.js";
import { candidateReadRoutes } from "./routes/candidates-read.js";
import { jobsRoutes } from "./routes/jobs.js";
import { publicParseRoutes } from "./routes/public-parse.js";
import { reviewRoutes } from "./routes/review.js";
import { rubricsRoutes } from "./routes/rubrics.js";
import { scoringRoutes } from "./routes/scoring.js";
import { searchRoutes } from "./routes/search.js";
import { settingsRoutes } from "./routes/settings.js";
import { auditExportRoutes, publicShareRoutes, sharingRoutes } from "./routes/sharing.js";
import { auditSnapshotRoutes, cronSnapshotRoutes } from "./routes/snapshots.js";
import { talentPoolRoutes } from "./routes/talent-pool.js";
import { tokenRoutes } from "./routes/tokens.js";
import { interviewKitRoutes, portalRoutes, publicPortalRoutes } from "./routes/wave4.js";
import type { AppEnv } from "./types.js";

export interface AppDeps {
  db: Database;
  llm: LanguageModel | null;
  /** Semantic indexer; null/omitted → search falls back to keyword mode. */
  indexer?: HireLensIndexer | null;
  /**
   * Captured readLlmEnv() failure: the env HAS LLM variables but they are
   * invalid. Surfaced (sanitised) by /api/health?db=1 and Settings so the
   * operator sees the real problem instead of a generic "no key".
   */
  llmConfigError?: string | null;
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
    c.set("llmConfigError", deps.llmConfigError ?? null);
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

  // Health check — public, no DB round-trip by default so load balancers
  // can probe cheaply. `?db=1` additionally verifies the database is
  // reachable AND that migrations are current (drizzle's journal exists
  // and is non-empty): a deployment whose schema is behind reports a
  // clear 503 migrations_pending instead of opaque 500s on every
  // org-scoped route.
  app.get("/api/health", async (c) => {
    const llmInfo = {
      configured: deps.llm != null,
      ...(deps.llmConfigError ? { configError: sanitizeLlmConfigError(deps.llmConfigError) } : {}),
    };
    if (c.req.query("db") !== "1") {
      return c.json({ ok: true as const, service: "hirelens-api", version: "0.1.0", llm: llmInfo });
    }
    let db: Database | null = null;
    try {
      db = c.get("db");
      const { sql } = await import("drizzle-orm");
      // Applied state vs the checked-in journal snapshot: the migrator
      // records created_at = the journal entry's `when`, so comparing
      // the sets detects "behind by N" (e.g. 11 of 13 applied) that a
      // count-only check passes as healthy.
      const result = await db.execute<{ t: string }>(
        sql`SELECT created_at::text AS t FROM drizzle.__drizzle_migrations`,
      );
      const state = compareMigrations(result.rows.map((r) => Number(r.t)));
      const migrations = {
        applied: state.applied,
        expected: MIGRATION_SNAPSHOT.length,
        behindBy: state.missing.length,
        ...(state.missing.length > 0 ? { missing: state.missing.slice(-5) } : {}),
        ...(state.unknown > 0 ? { unknown: state.unknown } : {}),
      };
      if (state.missing.length > 0) {
        const missing = state.missing.slice(-3).join(", ");
        return c.json(
          {
            ok: false as const,
            service: "hirelens-api",
            version: "0.1.0",
            migrationsPending: true,
            migrations,
            llm: llmInfo,
            message: `Database schema is behind by ${state.missing.length} migration(s) (newest missing: ${missing}). Run: pnpm --filter @hirelens/db db:migrate`,
          },
          503,
        );
      }
      const warnings =
        state.unknown > 0
          ? ` ${state.unknown} applied migration(s) do not match the journal — verify they were applied intentionally.`
          : "";
      return c.json({
        ok: true as const,
        service: "hirelens-api",
        version: "0.1.0",
        migrations,
        llm: llmInfo,
        ...(state.unknown > 0 ? { message: `Schema is current.${warnings}` } : {}),
      });
    } catch (err) {
      const missing = isMissingTableError(err);
      captureException(err, { requestId: c.get("requestId"), path: "/api/health?db=1" });
      return c.json(
        {
          ok: false as const,
          service: "hirelens-api",
          version: "0.1.0",
          ...(missing ? { migrationsPending: true } : {}),
          llm: llmInfo,
          message: missing
            ? "Database schema is out of date (migrations journal missing). Run: pnpm --filter @hirelens/db db:migrate"
            : "Database is unreachable.",
        },
        503,
      );
    }
  });

  // Public API contract (public document; auth still governs the endpoints it describes).
  app.get("/api/openapi.json", (c) => c.json(openApiDocument));

  // Public, token-gated share report — mounted BEFORE the protected API so
  // the token is the only credential (requireAuth's /api/* middleware must
  // not intercept these reads).
  app.route("/api", publicShareRoutes());
  app.route("/api", publicPortalRoutes());
  app.route("/api", publicCandidateReportRoutes());
  app.route("/api", cronSnapshotRoutes());
  app.route("/api", atsWebhookRoutes());
  app.route("/api", publicParseRoutes());

  // Authenticated, org-scoped API surface.
  const protectedApi = new Hono<AppEnv>();
  protectedApi.use("*", requireAuth());
  protectedApi.route("/jobs/:jobId/rubrics", rubricsRoutes());
  protectedApi.route("/jobs/:jobId/candidates", candidateReadRoutes());
  protectedApi.route("/jobs/:jobId/candidates", aiContentRoutes());
  protectedApi.route("/jobs/:jobId/demographics", demographicsRoutes());
  protectedApi.route("/jobs/:jobId", scoringRoutes());
  protectedApi.route("/jobs/:jobId", reviewRoutes());
  protectedApi.route("/jobs/:jobId/bias-audit", biasAuditRoutes());
  protectedApi.route("/jobs/:jobId", searchRoutes());
  protectedApi.route("/jobs/:jobId", sharingRoutes());
  protectedApi.route("/jobs/:jobId/portal", portalRoutes());
  protectedApi.route("/jobs/:jobId/candidates", candidateReportRoutes());
  protectedApi.route("/jobs/:jobId", interviewKitRoutes());
  protectedApi.route("/jobs/:jobId", auditExportRoutes());
  protectedApi.route("/jobs/:jobId", auditSnapshotRoutes());
  protectedApi.route("/jobs", jobsRoutes());
  protectedApi.route("/analytics", analyticsRoutes());
  protectedApi.route("/", talentPoolRoutes());
  protectedApi.route("/tokens", tokenRoutes());
  protectedApi.route("/settings", settingsRoutes());
  app.route("/api", protectedApi);

  app.onError((err, c) => {
    if (err instanceof ApiInputError) {
      return c.json({ ok: false, error: err.code, message: err.message }, err.status);
    }
    if (err instanceof ExtractionError) {
      return c.json({ ok: false, error: "unreadable_document", message: err.message }, 422);
    }
    const errorId = randomUUID();
    captureException(err, {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
    });
    // Correlation id: users can quote it, support can find it in logs.
    // Full details are returned ONLY when both a server-side env flag and
    // a matching secret header are present (operator debug tooling —
    // never visible to regular users).
    const debugAuthorized =
      process.env["ERROR_DEBUG_ENABLED"] === "true" &&
      process.env["ERROR_DEBUG_SECRET"] !== undefined &&
      c.req.header("x-error-debug-secret") === process.env["ERROR_DEBUG_SECRET"];
    return c.json(
      {
        ok: false,
        error: "internal_error",
        errorId,
        ...(debugAuthorized
          ? { debug: { name: err.name, message: err.message, stack: err.stack } }
          : {}),
      },
      500,
    );
  });

  app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
  return app;
}
