/**
 * Which LLM providers does this server have usable credentials for, and
 * can each one actually serve right now? Powers the Settings UI's
 * provider list and its live "Test" probes. Keys themselves never leave
 * the server — only ids, labels, and ping outcomes.
 *
 * All provider configuration comes from readLlmEnv() — the single source
 * of truth for HIRELENS_LLM_* parsing. This module no longer re-parses
 * the env (that duplication is how the "Groq called with the primary's
 * model id" bug happened).
 */
import {
  type LanguageModel,
  PROVIDER_LABELS,
  pingModel,
  resolveLanguageModel,
} from "@hirelens/core";
import { type LlmEnv, readLlmEnv } from "./env.js";

interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  buildModel: () => LanguageModel;
}

function buildProviderModel(provider: string, model: string, key?: string, baseUrl?: string) {
  return resolveLanguageModel({
    id: provider as Parameters<typeof resolveLanguageModel>[0]["id"],
    model,
    ...(key === undefined || key === "" ? {} : { apiKey: key }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
  });
}

/** The set of (provider, model, key, baseUrl) configs known to the server. */
export function configuredProviderInfos(source: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  let llm: LlmEnv | null = null;
  try {
    llm = readLlmEnv(source);
  } catch {
    // A misconfigured HIRELENS_LLM_* env must not 500 the settings page —
    // the picker works (empty), and boot/other routes surface the error.
    return [];
  }
  if (llm === null) return [];
  const out: ProviderInfo[] = [
    {
      id: llm.provider,
      label: PROVIDER_LABELS[llm.provider] ?? llm.provider,
      model: llm.model,
      buildModel: () => buildProviderModel(llm.provider, llm.model, llm.apiKey, llm.baseUrl),
    },
  ];
  for (const f of llm.fallbacks) {
    if (out.some((o) => o.id === f.provider)) continue;
    out.push({
      id: f.provider,
      label: PROVIDER_LABELS[f.provider] ?? f.provider,
      model: f.model,
      buildModel: () => buildProviderModel(f.provider, f.model, f.apiKey, f.baseUrl),
    });
  }
  return out;
}

export interface ProviderProbe {
  id: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/** Live probe per configured provider (used by the settings test endpoint). */
export function llmProviderStatus(): Array<ProviderInfo & { test: () => Promise<ProviderProbe> }> {
  return configuredProviderInfos().map((info) => ({
    ...info,
    test: async (): Promise<ProviderProbe> => {
      const t0 = Date.now();
      try {
        await pingModel(info.buildModel());
        return { id: info.id, ok: true, latencyMs: Date.now() - t0 };
      } catch (err) {
        return {
          id: info.id,
          ok: false,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        };
      }
    },
  }));
}
