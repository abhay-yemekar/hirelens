/**
 * Structured logging (pino) + Langfuse LLM tracing, both no-ops until
 * configured. Observability must never make the product harder to run:
 * with no env vars set, the logger writes pretty lines to stdout and the
 * tracer returns null, and callers skip it.
 */

import * as Sentry from "@sentry/node";
import { Langfuse, type LangfuseTraceClient } from "langfuse";
import pino from "pino";

const isDev = process.env["NODE_ENV"] !== "production";

/** Shared structured logger. JSON in production, pretty in dev. */
export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  ...(isDev ? { transport: { target: "pino-pretty", options: { singleLine: true } } } : {}),
});

// ---------- Sentry error tracking (no-op without SENTRY_DSN) ----------

/**
 * Initialize Sentry when SENTRY_DSN is set. Safe to call unconditionally:
 * without a DSN this is a no-op and captureException just logs.
 */
export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    ...(process.env["RELEASE"] ? { release: process.env["RELEASE"] } : {}),
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
  logger.info("sentry.initialized");
}

/**
 * Report an error to Sentry with request context. When Sentry is not
 * configured this falls back to the structured logger so nothing is lost.
 */
export function captureException(err: unknown, ctx: Record<string, unknown> = {}): void {
  if (process.env["SENTRY_DSN"]) {
    Sentry.captureException(err, { extra: ctx });
  }
  logger.error({ err, ...ctx }, "error.captured");
}

/** Flush pending Sentry events; call on shutdown. */
export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!process.env["SENTRY_DSN"]) return true;
  return Sentry.flush(timeoutMs);
}

// ---------- Langfuse LLM tracing ----------

let langfuse: Langfuse | null = null;

function langfuseClient(): Langfuse | null {
  if (langfuse !== null) return langfuse;
  const publicKey = process.env["LANGFUSE_PUBLIC_KEY"];
  const secretKey = process.env["LANGFUSE_SECRET_KEY"];
  if (!publicKey || !secretKey) return null;
  langfuse = new Langfuse({
    publicKey,
    secretKey,
    ...(process.env["LANGFUSE_BASE_URL"] ? { baseUrl: process.env["LANGFUSE_BASE_URL"] } : {}),
  });
  return langfuse;
}

export interface TraceHandle {
  trace: LangfuseTraceClient;
  /** Flush + release. Call when the traced unit of work ends. */
  end: () => Promise<void>;
}

/**
 * Start a trace for a named unit of work (e.g. a scoring batch or a
 * single scoring run). Returns null when Langfuse is not configured —
 * callers skip tracing entirely.
 */
export function startTrace(
  name: string,
  metadata: Record<string, unknown> = {},
): TraceHandle | null {
  const client = langfuseClient();
  if (!client) return null;
  const trace = client.trace({
    name,
    metadata,
    ...(process.env["RELEASE"] ? { release: process.env["RELEASE"] } : {}),
  });
  return {
    trace,
    end: async () => {
      await client.shutdownAsync();
      langfuse = null;
    },
  };
}

/** True when LLM tracing is active (exposed for health/debug endpoints). */
export function tracingEnabled(): boolean {
  return langfuseClient() !== null;
}
