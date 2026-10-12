import { z } from "zod";

/**
 * API environment. DATABASE_URL falls back to the local compose default so
 * `pnpm dev` works out of the box; production must set it explicitly.
 */
/** Empty-string env vars behave as unset (coercion would produce 0/""). */
const emptyAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema) as z.ZodType<z.output<T>>;

const EnvSchema = z.object({
  PORT: emptyAsUndefined(z.coerce.number().int().min(1).default(4000)),
  DATABASE_URL: emptyAsUndefined(
    z.string().min(1).default("postgres://postgres:postgres@localhost:5433/hirelens"),
  ),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return EnvSchema.parse(source);
}

/** LLM selection from env; consumed by resolveLanguageModel(). */
export interface LlmEnv {
  provider: "google" | "anthropic" | "groq" | "openrouter" | "mistral" | "cerebras" | "ollama";
  model: string;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  /**
   * Ordered fallback providers tried only on transient provider failures
   * (overload/rate limit). Each entry may carry its own key/model via
   * HIRELENS_LLM_<PROVIDER>_API_KEY / _MODEL, else inherits the primary's
   * provider-level env where applicable.
   */
  fallbacks: Array<{
    provider: LlmEnv["provider"];
    model?: string | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
  }>;
}

const LLM_PROVIDER_IDS = [
  "google",
  "anthropic",
  "groq",
  "openrouter",
  "mistral",
  "cerebras",
  "ollama",
] as const;

/**
 * Read HIRELENS_LLM_* variables. Returns null when none are set so the
 * app can start without LLM features (scoring/derivation routes 503).
 * A PARTIAL config (provider without model, unknown provider) throws —
 * misconfiguration must fail loudly, not silently disable features.
 */
export function readLlmEnv(source: NodeJS.ProcessEnv = process.env): LlmEnv | null {
  // Empty strings count as unset — compose files commonly pass `${VAR:-}`
  // defaults, and a self-hoster without LLM config must get the no-model
  // mode (scoring/derive 503), not a boot crash.
  const provider = source["HIRELENS_LLM_PROVIDER"]?.trim() || undefined;
  const model = source["HIRELENS_LLM_MODEL"]?.trim() || undefined;
  if (provider === undefined && model === undefined) return null;
  if (provider === undefined || model === undefined) {
    throw new Error("HIRELENS_LLM_PROVIDER and HIRELENS_LLM_MODEL must be set together");
  }
  if (!(LLM_PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new Error(
      `Unknown HIRELENS_LLM_PROVIDER "${provider}" (expected one of: ${LLM_PROVIDER_IDS.join(", ")})`,
    );
  }
  const apiKey = source["HIRELENS_LLM_API_KEY"];
  const baseUrl = source["HIRELENS_LLM_BASE_URL"];

  // Fallback chain: comma-separated provider ids. Each may override its
  // model/key/base URL via HIRELENS_LLM_<ID>_MODEL / _API_KEY / _BASE_URL
  // (uppercase provider id in the var name, e.g. HIRELENS_LLM_GROQ_API_KEY).
  const fallbacks: LlmEnv["fallbacks"] = [];
  const rawFallbacks = source["HIRELENS_LLM_FALLBACKS"]?.trim() ?? "";
  if (rawFallbacks !== "") {
    for (const part of rawFallbacks.split(",")) {
      const fp = part.trim().toLowerCase();
      if (fp === "") continue;
      if (!(LLM_PROVIDER_IDS as readonly string[]).includes(fp)) {
        throw new Error(
          `Unknown HIRELENS_LLM_FALLBACKS provider "${fp}" (expected one of: ${LLM_PROVIDER_IDS.join(", ")})`,
        );
      }
      if (fp === provider) continue; // dedupe: primary already tried first
      const upper = fp.toUpperCase().replaceAll("-", "_");
      const fModel = source[`HIRELENS_LLM_${upper}_MODEL`]?.trim() || undefined;
      const fKey = source[`HIRELENS_LLM_${upper}_API_KEY`]?.trim() || undefined;
      const fBase = source[`HIRELENS_LLM_${upper}_BASE_URL`]?.trim() || undefined;
      fallbacks.push({
        provider: fp as LlmEnv["provider"],
        ...(fModel === undefined ? {} : { model: fModel }),
        ...(fKey === undefined ? {} : { apiKey: fKey }),
        ...(fBase === undefined ? {} : { baseUrl: fBase }),
      });
    }
  }

  return {
    provider: provider as LlmEnv["provider"],
    model,
    fallbacks,
    ...(apiKey === undefined || apiKey === "" ? {} : { apiKey }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
  };
}
