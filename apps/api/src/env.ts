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
  provider: "google" | "anthropic" | "groq" | "openrouter" | "ollama";
  model: string;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
}

const LLM_PROVIDER_IDS = ["google", "anthropic", "groq", "openrouter", "ollama"] as const;

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
  return {
    provider: provider as LlmEnv["provider"],
    model,
    ...(apiKey === undefined || apiKey === "" ? {} : { apiKey }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
  };
}
