import { AllProvidersFailedError } from "@hirelens/core";
import { ApiInputError } from "./errors.js";

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
export function isLlmMisconfiguredError(err: unknown): boolean {
  let message: string;
  if (err instanceof AllProvidersFailedError) {
    message = err.attempts.map((a) => a.message).join(" ");
  } else {
    message = err instanceof Error ? err.message : String(err);
  }
  return (
    /\bmodel\b.*\bdoes not exist\b|\bnot a valid model\b|invalid_model|model_not_found/i.test(
      message,
    ) ||
    /invalid_api_key|invalid x-api-key|incorrect api key|authentication_error|unauthorized|forbidden|permission denied/i.test(
      message,
    )
  );
}

/**
 * Map a provider failure to the ApiInputError the routes throw:
 * transient → bad_response (502), misconfig → llm_misconfigured (503)
 * with actionable text naming the env vars to check.
 */
export function llmRouteError(context: string, err: unknown): ApiInputError {
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
