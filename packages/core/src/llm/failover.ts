/**
 * Failover language-model chain.
 *
 * Wraps an ordered list of provider models behind one LanguageModel
 * interface. Each `doGenerate` tries the primary; if (and only if) the
 * failure is provider-level — overload, rate limit, quota, network — the
 * next provider in the chain serves. Everything else (schema rejections,
 * schema violations, misconfig) stays on the current provider so the
 * existing repair machinery can handle it without mixing providers.
 *
 * The chosen provider's own JSON-mode memory key (`jsonModeProviders`) is
 * per-provider because a schema Google cannot express natively may be
 * fine for Groq — the per-provider keyed memory in generate.ts handles
 * that; this module only needs robust provider identity.
 */
import type { LanguageModel } from "./config.js";
import { isTransientProviderError } from "./generate.js";

/** The narrow shape we actually need from any model in the chain. */
interface DoGenerateCapable {
  doGenerate(params: unknown): Promise<unknown>;
}

/** One entry in the chain: provider id + constructed model. */
export interface ChainEntry {
  id: string;
  model: LanguageModel;
}

/** Runtime-validated cast: the AI SDK's v2 models all expose doGenerate. */
function asDoGenerate(model: LanguageModel): DoGenerateCapable {
  const m = model as unknown as Record<string, unknown>;
  if (typeof m["doGenerate"] !== "function") {
    throw new Error("failover chain entry does not implement doGenerate");
  }
  return m as unknown as DoGenerateCapable;
}

export interface FailoverMetadata {
  /** 0-based position of the provider that ultimately served the call. */
  chainPosition: number;
  /** Provider id of the model that ultimately served the call. */
  servedBy: string;
  /** How many chain entries were tried (1 = primary worked). */
  tried: number;
}

/** Last-served bookkeeping so audit/telemetry can learn which provider served. */
const lastServed = new WeakMap<object, FailoverMetadata>();

/** Metadata of the provider that served the most recent call on this model. */
export function lastFailoverMetadata(model: LanguageModel): FailoverMetadata | undefined {
  return lastServed.get(model as unknown as object);
}

function providerIdOf(model: LanguageModel): string {
  const m = model as { provider?: unknown };
  return typeof m.provider === "string" ? m.provider : "";
}

/**
 * Build a chain model. The returned object satisfies the AI SDK's
 * LanguageModelV2 interface by delegating (specificationVersion, provider,
 * modelId, doGenerate) to whichever entry is currently being tried.
 */
export function createFailoverModel(entries: ChainEntry[]): LanguageModel {
  if (entries.length === 0) {
    throw new Error("createFailoverModel requires at least one provider entry");
  }

  const chain = {
    specificationVersion: "v2" as const,
    provider: entries.map((e) => providerIdOf(e.model)).join("+"),
    modelId: entries.map((e) => providerIdOf(e.model)).join("+"),
    async doGenerate(params: {
      prompt: unknown;
      temperature: number | undefined;
      seed: number | undefined;
      [key: string]: unknown;
    }) {
      let lastError: unknown;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        try {
          const result = (await asDoGenerate(entry.model).doGenerate(params)) as Record<
            string,
            unknown
          >;
          lastServed.set(chainModel as unknown as object, {
            chainPosition: i,
            servedBy: providerIdOf(entry.model),
            tried: i + 1,
          });
          // Stamp the serving provider into the response so downstream
          // code reading provider from the result sees the real one.
          if (result && typeof result === "object") {
            result["provider"] = providerIdOf(entry.model);
          }
          return result;
        } catch (err) {
          lastError = err;
          // Non-provider-level failures (schema rejections, violations)
          // must not jump providers — rethrow for the repair paths.
          if (!isTransientProviderError(err)) {
            throw err;
          }
        }
      }
      // Every entry transiently failed: surface the primary's last error
      // wrapped with the chain context.
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`All ${entries.length} providers failed; last error: ${msg}`);
    },
  };

  const chainModel = chain as unknown as LanguageModel;
  return chainModel;
}
