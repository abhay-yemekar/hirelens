import { createDb } from "@hirelens/db";
import { createApp } from "./app.js";
import { readLlmEnv } from "./env.js";
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
  return createApp({ db, llm: modelFromEnv(readLlmEnv()) });
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
