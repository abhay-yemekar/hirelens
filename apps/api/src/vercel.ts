import { createDb } from "@hirelens/db";
import { createApp } from "./app.js";
import { readLlmEnv } from "./env.js";
import { createIndexer, embeddingModelFromEnv } from "./indexing.js";
import { modelFromEnv } from "./model.js";
import { flushSentry, initSentry } from "./observability.js";

/**
 * Serverless entry point for Vercel (and any fetch-compatible host).
 *
 * The long-running Node server lives in main.ts (Docker / self-host);
 * this module exposes the same Hono app as a lazily-created, cached
 * instance for embedding — the Next.js route handler at
 * apps/web/app/api/[[...route]]/route.ts mounts it under /api so the
 * deployed product is a single origin (first-party auth cookies).
 *
 * Dependencies are cached on globalThis because serverless invocations
 * reuse warm instances — a fresh module scope would rebuild the DB pool
 * and LLM client on every request.
 *
 * Env contract (set in the deployment dashboard):
 * - DATABASE_URL — Neon *pooled* connection string (…-pooler…); serverless
 *   opens many short-lived connections and would exhaust a direct one.
 * - BETTER_AUTH_URL / BETTER_AUTH_SECRET / CORS_ORIGINS / TRUSTED_ORIGINS
 * - HIRELENS_LLM_PROVIDER / _MODEL / _API_KEY
 * - SENTRY_DSN / LANGFUSE_* (optional; no-ops without them)
 */

interface ApiGlobals {
  __hirelensApiApp?: HonoLikeApp | undefined;
  __hirelensApiInit?: Promise<HonoLikeApp> | undefined;
}

const globals = globalThis as typeof globalThis & ApiGlobals;

async function buildApp(): Promise<HonoLikeApp> {
  initSentry();
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set in the deployment environment");
  }
  const db = createDb(databaseUrl);
  const embedding = embeddingModelFromEnv(process.env);
  // Serverless degrade-loudly rule: a bad HIRELENS_LLM_* config must not
  // kill every route (a throw here takes the whole function down — as the
  // "groq fallback without a model id" incident showed, when the strict
  // boot validation fired at cold start and even /api/health 500'd).
  // Degraded mode keeps auth/jobs/settings working and the LLM routes
  // report 503 llm_not_configured until the operator fixes the env.
  let llm: ReturnType<typeof readLlmEnv> = null;
  let llmConfigError: string | null = null;
  try {
    llm = readLlmEnv();
  } catch (err) {
    const { captureException } = await import("./observability.js");
    captureException(err, { scope: "llm-config", mode: "degraded_no_llm" });
    // Keep the reason: health?db=1 and Settings surface it, so the
    // operator sees "the env is invalid because …" instead of the
    // misleading "needs an LLM key".
    llmConfigError = err instanceof Error ? err.message : String(err);
  }
  return createApp({
    db,
    llm: modelFromEnv(llm),
    indexer: embedding ? createIndexer(db, embedding) : null,
    ...(llmConfigError === null ? {} : { llmConfigError }),
  });
}

export type HonoLikeApp = ReturnType<typeof createApp>;

/** The embedded Hono app, created once per warm instance. */
export function getServerApp(): Promise<HonoLikeApp> {
  if (!globals.__hirelensApiInit) {
    globals.__hirelensApiInit = buildApp();
  }
  return globals.__hirelensApiInit;
}

/** Test helper: drop the cached app so a later call rebuilds it. */
export function resetServerApp(): void {
  globals.__hirelensApiApp = undefined;
  globals.__hirelensApiInit = undefined;
}

/** Flush pending observability payloads (no-op without env keys). */
export { flushSentry };
