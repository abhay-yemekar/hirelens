import type { LanguageModel } from "./config.js";

export interface MockModelCall {
  system: string;
  prompt: string;
  temperature: number | undefined;
  seed: number | undefined;
}

export interface MockModelOptions {
  /** Tool arguments to return as the model's structured output. */
  args?: unknown;
  /** Optional queue: nth call returns nth args (last one repeats). */
  argsPerCall?: unknown[];
  /** Fail every call with this error. */
  failWith?: Error;
}

/**
 * Minimal LanguageModel test double capturing every call, so engine
 * tests run without network access or API keys.
 */
export function createMockModel(options: MockModelOptions): {
  model: LanguageModel;
  calls: MockModelCall[];
} {
  const calls: MockModelCall[] = [];
  let n = 0;
  const model = {
    specificationVersion: "v2" as const,
    provider: "mock",
    modelId: "mock-1",
    async doGenerate(opts: {
      prompt: unknown;
      temperature: number | undefined;
      seed: number | undefined;
    }) {
      const sys = extractSystem(opts.prompt);
      calls.push({
        system: sys,
        prompt: lastUserText(opts.prompt),
        temperature: opts.temperature,
        seed: opts.seed,
      });
      if (options.failWith) throw options.failWith;
      const args = options.argsPerCall
        ? (options.argsPerCall[Math.min(n, options.argsPerCall.length - 1)] ?? options.args)
        : options.args;
      n += 1;
      return {
        content: [
          {
            type: "tool-call" as const,
            toolCallId: `call-${n}`,
            toolName: "respond",
            input: args ?? {},
          },
        ],
        finishReason: "stop" as const,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        warnings: [],
      };
    },
  } as unknown as LanguageModel;
  return { model, calls };
}

function extractSystem(prompt: unknown): string {
  const arr = Array.isArray(prompt) ? prompt : [];
  const first = arr[0] as { role?: string; content?: unknown } | undefined;
  if (first?.role === "system") {
    return typeof first.content === "string" ? first.content : JSON.stringify(first.content ?? "");
  }
  return "";
}

function lastUserText(prompt: unknown): string {
  const arr = Array.isArray(prompt) ? prompt : [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i] as { role?: string; content?: unknown } | undefined;
    if (m?.role === "user") {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        const parts = m.content as Array<{ type?: string; text?: string }>;
        return parts.map((p) => (p?.type === "text" ? (p.text ?? "") : "")).join("");
      }
      return JSON.stringify(m.content ?? "");
    }
  }
  return "";
}
