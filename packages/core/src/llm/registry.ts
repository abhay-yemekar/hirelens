import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelFactory, ProviderConfig } from "./config.js";
import { assertValidProviderConfig, LlmConfigError } from "./config.js";

/**
 * Per-provider model factories. Ollama and OpenRouter both speak the
 * OpenAI-compatible protocol; each hosted package exposes a `create…`
 * factory that returns a model for a given model id.
 */
export const PROVIDER_FACTORIES: Record<string, LanguageModelFactory> = {
  google: (c: ProviderConfig) =>
    createGoogleGenerativeAI(c.apiKey === undefined ? {} : { apiKey: c.apiKey })(c.model),
  anthropic: (c: ProviderConfig) =>
    createAnthropic(c.apiKey === undefined ? {} : { apiKey: c.apiKey })(c.model),
  groq: (c: ProviderConfig) =>
    createGroq(c.apiKey === undefined ? {} : { apiKey: c.apiKey })(c.model),
  openrouter: (c: ProviderConfig) =>
    createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      ...(c.apiKey === undefined ? {} : { apiKey: c.apiKey }),
    })(c.model),
  ollama: (c: ProviderConfig) =>
    createOpenAICompatible({
      name: "ollama",
      baseURL: c.baseUrl ?? "http://localhost:11434/v1",
      apiKey: "ollama-uses-no-key",
    })(c.model),
};

/** Build the AI SDK language model for a validated provider config. */
export function resolveLanguageModel(config: ProviderConfig): ReturnType<LanguageModelFactory> {
  assertValidProviderConfig(config);
  const factory = PROVIDER_FACTORIES[config.id];
  if (!factory) throw new LlmConfigError(`No factory for provider ${config.id}`);
  return factory(config);
}
