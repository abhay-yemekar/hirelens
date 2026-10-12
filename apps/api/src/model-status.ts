/**
 * Which LLM providers does this server have usable credentials for, and
 * can each one actually serve right now? Powers the Settings UI's
 * provider list and its live "Test" probes. Keys themselves never leave
 * the server — only ids, labels, and ping outcomes.
 */
import {
  type LanguageModel,
  PROVIDER_LABELS,
  pingModel,
  resolveLanguageModel,
} from "@hirelens/core";

interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  buildModel: () => LanguageModel;
}

function buildProviderModel(provider: string, model: string, isFallback: boolean): LanguageModel {
  const upper = provider.toUpperCase().replaceAll("-", "_");
  const keyConn = isFallback
    ? process.env[`HIRELENS_LLM_${upper}_API_KEY`]
    : process.env["HIRELENS_LLM_API_KEY"];
  const key = (keyConn ?? "").trim();
  const baseConn = isFallback
    ? process.env[`HIRELENS_LLM_${upper}_BASE_URL`]
    : process.env["HIRELENS_LLM_BASE_URL"];
  const baseUrl = (baseConn ?? "").trim();
  return resolveLanguageModel({
    id: provider as Parameters<typeof resolveLanguageModel>[0]["id"],
    model,
    ...(key === "" ? {} : { apiKey: key }),
    ...(baseUrl === "" ? {} : { baseUrl }),
  });
}

/** The set of (provider, model, key, baseUrl) configs known to the server. */
export function configuredProviderInfos(): ProviderInfo[] {
  const out: ProviderInfo[] = [];
  const provider = process.env["HIRELENS_LLM_PROVIDER"]?.trim();
  const model = process.env["HIRELENS_LLM_MODEL"]?.trim();
  if (provider && model) {
    out.push({
      id: provider,
      label: PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider,
      model,
      buildModel: () => buildProviderModel(provider, model, false),
    });
  }
  const fallbacks = process.env["HIRELENS_LLM_FALLBACKS"]?.trim() ?? "";
  for (const part of fallbacks.split(",")) {
    const fp = part.trim().toLowerCase();
    if (fp === "" || out.some((o) => o.id === fp)) continue;
    const upper = fp.toUpperCase().replaceAll("-", "_");
    const fModel = process.env[`HIRELENS_LLM_${upper}_MODEL`]?.trim() || model;
    if (!fModel) continue;
    out.push({
      id: fp,
      label: PROVIDER_LABELS[fp as keyof typeof PROVIDER_LABELS] ?? fp,
      model: fModel,
      buildModel: () => buildProviderModel(fp, fModel, true),
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
