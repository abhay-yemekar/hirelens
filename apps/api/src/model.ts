import type { LanguageModel } from "@hirelens/core";
import { resolveLanguageModel } from "@hirelens/core";
import type { LlmEnv } from "./env.js";

/**
 * Build the app-wide LanguageModel from parsed env. Returns null when
 * HIRELENS_LLM_* is unset (LLM routes respond 503 llm_not_configured).
 */
export function modelFromEnv(llm: LlmEnv | null): LanguageModel | null {
  if (llm === null) return null;
  return resolveLanguageModel({
    id: llm.provider,
    model: llm.model,
    ...(llm.apiKey === undefined ? {} : { apiKey: llm.apiKey }),
    ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
  });
}
