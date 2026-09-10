/**
 * Provider-agnostic LLM configuration. Users bring their own keys; nothing
 * here hardcodes credentials or depends on a hosting SDK.
 */

import type { LanguageModel as AiLanguageModel } from "ai";

export type LlmProviderId = "google" | "anthropic" | "groq" | "openrouter" | "ollama";

export interface ProviderConfig {
  id: LlmProviderId;
  /** Model identifier as the provider expects it, e.g. "gemini-3-flash". */
  model: string;
  /** API key; required for hosted providers, ignored for ollama. */
  apiKey?: string;
  /** Base URL override (required for ollama, optional elsewhere). */
  baseUrl?: string;
}

/** Factory for a provider's language-model instance, given resolved config. */
export type LanguageModelFactory = (config: ProviderConfig) => LanguageModel;

/** The AI SDK's language model interface; tests may substitute via cast. */
export type LanguageModel = AiLanguageModel;

export interface ResolvedRegistry {
  /** Default provider used for rubric derivation and scoring. */
  default: LlmProviderId;
  /** Optional fast/cheap provider for bulk or extraction paths. */
  fast?: LlmProviderId;
  /** Adjudicator provider for the consistency guard (may equal default). */
  adjudicator?: LlmProviderId;
}

export const DEFAULT_REGISTRY: ResolvedRegistry = {
  default: "google",
  adjudicator: "google",
};

const HOSTED: ReadonlySet<string> = new Set(["google", "anthropic", "groq", "openrouter"]);

/** Validate a provider config; throws with a precise message on misuse. */
export function assertValidProviderConfig(config: ProviderConfig): void {
  if (!HOSTED.has(config.id) && config.id !== "ollama") {
    throw new LlmConfigError(`Unknown provider id: ${config.id}`);
  }
  if (HOSTED.has(config.id) && !config.apiKey) {
    throw new LlmConfigError(`Provider ${config.id} requires an apiKey`);
  }
  if (config.id === "ollama" && !config.baseUrl) {
    throw new LlmConfigError(
      "Provider ollama requires a baseUrl (e.g. http://localhost:11434/api)",
    );
  }
  if (!config.model || config.model.trim().length === 0) {
    throw new LlmConfigError("A model id is required");
  }
}

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}
