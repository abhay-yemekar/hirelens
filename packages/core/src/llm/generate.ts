import { generateText, tool } from "ai";
import type { z } from "zod";
import type { LanguageModel } from "./config.js";
import type { GenerationRequest, StructuredResult, UsageInfo } from "./types.js";
import { LlmRuntimeError, SchemaViolationError } from "./types.js";

const MAX_ATTEMPTS = 2;

function toUsage(u: unknown): UsageInfo {
  const o = (u ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  return {
    inputTokens: num(o["inputTokens"]),
    outputTokens: num(o["outputTokens"]),
    totalTokens: num(o["totalTokens"]),
  };
}

/**
 * Generate output constrained to a Zod schema.
 *
 * Strategy: the schema is forced through a forced tool call (the provider's
 * native structured-output path). The arguments are then validated with
 * Zod; on violation the raw output is sent back with a repair instruction
 * once. The prototype's silent `JSON.parse` fallback is banned here —
 * unsatisfiable output raises `SchemaViolationError`.
 */
export async function generateStructured<S extends z.ZodType>(
  model: LanguageModel,
  request: GenerationRequest,
  schema: S,
): Promise<StructuredResult<z.infer<S>>> {
  let lastIssues = "";
  let lastRaw: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const repaired = attempt > 1;
    let toolCalls: Awaited<ReturnType<typeof generateText>>["toolCalls"];
    let text: string;
    let finishReason: Awaited<ReturnType<typeof generateText>>["finishReason"];
    let usage: Awaited<ReturnType<typeof generateText>>["usage"];
    try {
      ({ toolCalls, text, finishReason, usage } = await generateText({
        model,
        system: repaired
          ? `${request.system}\n\nYour previous output violated the schema. Return corrected output satisfying the schema exactly.`
          : request.system,
        prompt: repaired
          ? `${request.prompt}\n\nPrevious output that violated the schema:\n${lastRaw ?? "(none)"}\n\nSchema violations: ${lastIssues}\n\nReturn output that satisfies the schema.`
          : request.prompt,
        temperature: request.temperature ?? 0,
        ...(request.seed === undefined ? {} : { seed: request.seed }),
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
        tools: {
          respond: tool({
            description: "Return the structured result.",
            inputSchema: schema,
            execute: async () => "ok" as const,
          }),
        },
        toolChoice: { type: "tool", toolName: "respond" },
      }));
    } catch (err) {
      throw new LlmRuntimeError(
        `Provider call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const call = toolCalls[0];
    if (!call) {
      lastRaw = text;
      lastIssues = "no tool call was produced";
      continue;
    }
    // AI SDK v5+: the input arrives parsed; v4-era providers may hand back
    // JSON text, so coerce defensively before validating.
    const candidate = (call as { input?: unknown }).input ?? call;
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      return {
        object: parsed.data as z.infer<S>,
        rawText: text,
        finishReason: typeof finishReason === "string" ? finishReason : undefined,
        usage: toUsage(usage),
        attempts: attempt,
      };
    }
    lastIssues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
      .slice(0, 2000);
    lastRaw = JSON.stringify(candidate);
  }

  throw new SchemaViolationError(
    `Model output violated the schema after ${MAX_ATTEMPTS} attempts`,
    MAX_ATTEMPTS,
    lastIssues,
  );
}
