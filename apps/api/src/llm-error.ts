import { AllProvidersFailedError, type LanguageModel } from "@hirelens/core";
import type { Context } from "hono";
import { ApiInputError } from "./errors.js";
import type { AppEnv } from "./types.js";

/**
 * Detect "the table/schema does not exist yet" — Postgres 42P01 — across
 * all the shapes drivers throw: the raw pg error carries `code`, but
 * drizzle wraps it in a DrizzleQueryError whose `cause` holds the
 * original. Walking the cause chain is the only reliable check.
 */
export function isMissingTableError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (current instanceof Error || typeof current === "object") {
      const e = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (e.code === "42P01") return true;
      const message = typeof e.message === "string" ? e.message : "";
      if (/relation .* does not exist|schema .* does not exist/i.test(message)) return true;
      current = e.cause;
      continue;
    }
    break;
  }
  // Non-Error values: fall back to their string form.
  return /relation .* does not exist/i.test(String(err));
}

/** Signatures of "this provider configuration cannot serve requests". */
export function isLlmMisconfiguredMessage(message: string): boolean {
  return (
    /\bmodel\b.*\bdoes not exist\b|\bnot a valid model\b|invalid_model|model_not_found/i.test(
      message,
    ) ||
    /invalid_api_key|invalid x-api-key|incorrect api key|authentication_error|unauthorized|forbidden|permission denied/i.test(
      message,
    )
  );
}

/** Signatures of "this provider is temporarily unavailable — retrying/failover is sensible". */
export function isTransientMessage(message: string): boolean {
  return /\b429\b|\b503\b|\b5\d\d\b|rate.?limit|quota|resource.?exhausted|too many requests|overloaded|timeout|ECONNRESET|ECONNREFUSED|fetch failed|network/i.test(
    message,
  );
}

export type AttemptClassification = "misconfigured" | "transient" | "failed";

export function classifyAttempt(message: string): AttemptClassification {
  if (isLlmMisconfiguredMessage(message)) return "misconfigured";
  if (isTransientMessage(message)) return "transient";
  return "failed";
}

/** Human-readable per-attempt label for the breakdown shown to users. */
const CLASSIFICATION_LABELS: Record<AttemptClassification, string> = {
  misconfigured: "configuration invalid — check HIRELENS_LLM_<PROVIDER>_MODEL / _API_KEY",
  transient: "transient (rate limit or outage) — retrying or failover is sensible",
  failed: "provider returned an error",
};

/** Signatures of "this provider configuration cannot serve requests". */
export function isLlmMisconfiguredError(err: unknown): boolean {
  if (err instanceof AllProvidersFailedError) {
    // Per-attempt classification: the whole chain is misconfigured only
    // when EVERY provider is. "Gemini rate-limited + Groq misconfigured"
    // must not be reported as two misconfigurations (that hid the real
    // limit behind a config message).
    return err.attempts.every((a) => isLlmMisconfiguredMessage(a.message));
  }
  const message = err instanceof Error ? err.message : String(err);
  return isLlmMisconfiguredMessage(message);
}

/**
 * readLlmEnv() failure messages are ours — they name env vars and required
 * settings, never secret values — so they are safe to surface to the UI
 * verbatim, trimmed and length-capped.
 */
export function sanitizeLlmConfigError(detail: string): string {
  const cleaned = detail.trim().replace(/\s+/g, " ");
  return cleaned.length > 400 ? `${cleaned.slice(0, 397)}...` : cleaned;
}

/**
 * Single LLM-route guard: throws a typed 503 when no model is usable,
 * with the reason that is actually true — "no key in env" vs "env set
 * but invalid". Returns the narrowed model, so `const model =
 * requireLlmModel(c)` replaces the old get-get-check triple.
 */
export function requireLlmModel(c: Context<AppEnv>): LanguageModel {
  const model = c.get("model");
  if (model != null) return model;
  const configError = c.get("llmConfigError");
  if (configError) {
    throw new ApiInputError("llm_misconfigured", sanitizeLlmConfigError(configError), 503);
  }
  throw new ApiInputError(
    "llm_not_configured",
    "No LLM provider is configured in the environment. Set HIRELENS_LLM_PROVIDER and HIRELENS_LLM_MODEL.",
    503,
  );
}

/**
 * Map a provider failure to the ApiInputError the routes throw:
 * transient → bad_response (502), misconfig → llm_misconfigured (503)
 * with actionable text naming the env vars to check.
 *
 * A failover chain failure carries a per-provider breakdown so the real
 * root cause is visible: "google (transient...): ...; groq (config...): ..."
 */
export function llmRouteError(context: string, err: unknown): ApiInputError {
  if (err instanceof AllProvidersFailedError) {
    const breakdown = err.attempts
      .map(
        (a) =>
          `${a.provider} (${CLASSIFICATION_LABELS[classifyAttempt(a.message)]}): ${
            a.message.length > 160 ? `${a.message.slice(0, 157)}...` : a.message
          }`,
      )
      .join("; ");
    if (isLlmMisconfiguredError(err)) {
      return new ApiInputError(
        "llm_misconfigured",
        `${context}: the provider configuration is invalid. Per-provider: ${breakdown}. ` +
          "Check HIRELENS_LLM_PROVIDER, HIRELENS_LLM_MODEL, and any per-provider " +
          "HIRELENS_LLM_<ID>_MODEL / HIRELENS_LLM_<ID>_API_KEY in the server environment.",
        503,
      );
    }
    return new ApiInputError(
      "bad_response",
      `${context}: all ${err.attempts.length} configured providers failed. ${breakdown}`,
      502,
    );
  }
  if (isLlmMisconfiguredError(err)) {
    return new ApiInputError(
      "llm_misconfigured",
      `${context}: the provider configuration is invalid (unknown model id, rejected API key, or denied access). ` +
        "Check HIRELENS_LLM_PROVIDER, HIRELENS_LLM_MODEL, and any per-provider " +
        "HIRELENS_LLM_<ID>_MODEL / HIRELENS_LLM_<ID>_API_KEY in the server environment.",
      503,
    );
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new ApiInputError("bad_response", `${context}: ${detail}`, 502);
}
