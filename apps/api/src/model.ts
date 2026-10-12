import type { LanguageModel } from "@hirelens/core";
import { type ChainEntry, createFailoverModel, resolveLanguageModel } from "@hirelens/core";
import type { LlmEnv } from "./env.js";

/** Build one provider's model from a fallback entry (model overrides tolerated). */
function fallbackEntry(f: LlmEnv["fallbacks"][number], primaryModel: string): ChainEntry {
  const model = resolveLanguageModel({
    id: f.provider,
    model: f.model ?? primaryModel,
    ...(f.apiKey === undefined ? {} : { apiKey: f.apiKey }),
    ...(f.baseUrl === undefined ? {} : { baseUrl: f.baseUrl }),
  });
  return { id: f.provider, model };
}

/**
 * Build the app-wide LanguageModel from parsed env. Returns null when
 * HIRELENS_LLM_* is unset (LLM routes respond 503 llm_not_configured).
 *
 * With HIRELENS_LLM_FALLBACKS set, the model is a failover chain: the
 * primary serves every call; fallbacks are tried only on transient
 * provider failures (overload / rate limit), exactly the free-tier spike
 * case.
 */
export function modelFromEnv(llm: LlmEnv | null): LanguageModel | null {
  if (llm === null) return null;
  const primary: ChainEntry = {
    id: llm.provider,
    model: resolveLanguageModel({
      id: llm.provider,
      model: llm.model,
      ...(llm.apiKey === undefined ? {} : { apiKey: llm.apiKey }),
      ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
    }),
  };
  if (llm.fallbacks.length === 0) return primary.model;
  return createFailoverModel([primary, ...llm.fallbacks.map((f) => fallbackEntry(f, llm.model))]);
}
