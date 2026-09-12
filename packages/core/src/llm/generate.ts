import { generateObject, generateText, jsonSchema, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { LanguageModel } from "./config.js";
import type { GenerationRequest, StructuredResult, UsageInfo } from "./types.js";
import { LlmRuntimeError, SchemaViolationError } from "./types.js";

const MAX_ATTEMPTS = 2;

/**
 * Providers that proved unable to express the request schema in any
 * structured-output mode (learned at runtime). Google's response_schema
 * proto rejects arrays nested inside arrays ("Proto field is not
 * repeating") — rubric and scoring schemas use that shape throughout —
 * so after the first rejection every call for that provider goes
 * straight to validated JSON-text mode.
 */
const jsonModeProviders = new Set<string>();

function providerIdOf(model: LanguageModel): string {
  const m = model as { provider?: unknown };
  return typeof m.provider === "string" ? m.provider : "";
}

/** True when an array appears anywhere inside another array in the schema. */
export function schemaHasNestedArrays(schema: z.ZodType): boolean {
  let nested = false;
  const unwrap = (t: unknown): unknown => {
    if (t != null && typeof t === "object" && "innerType" in (t as Record<string, unknown>)) {
      return (t as { innerType: unknown }).innerType;
    }
    return t;
  };
  const walk = (node: unknown, insideArray: boolean): void => {
    if (nested || node == null || typeof node !== "object") return;
    if (node instanceof z.ZodArray) {
      if (insideArray) {
        nested = true;
        return;
      }
      walk(node.element, true);
      return;
    }
    if (node instanceof z.ZodObject) {
      for (const value of Object.values(node.shape)) walk(value, insideArray);
      return;
    }
    if (node instanceof z.ZodUnion) {
      for (const option of node.options) walk(option, insideArray);
      return;
    }
    if (node instanceof z.ZodIntersection) {
      const { left, right } = node as unknown as { left: z.ZodType; right: z.ZodType };
      walk(left, insideArray);
      walk(right, insideArray);
      return;
    }
    const inner = unwrap(node);
    if (inner !== node && inner != null) walk(inner, insideArray);
  };
  walk(schema, false);
  return nested;
}

/**
 * Pull a JSON object out of model text: strips code fences and any prose
 * around the object. Returns a reason string on failure so the repair
 * attempt can quote it.
 */
export function extractJsonObject(
  text: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return { ok: false, reason: "no JSON object found in output" };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) as unknown };
  } catch (err) {
    return {
      ok: false,
      reason: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Gemini's schema-rejection signature; other providers may match later. */
function isSchemaUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("Proto field is not repeating") || message.includes("response_schema");
}

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
 * Strategy: the AI SDK's native structured-output path (`generateObject`)
 * first. If a provider cannot express the schema (Google rejects nested
 * arrays in every structured mode), automatically fall back to
 * JSON-text mode — the JSON Schema is embedded in the prompt, the reply
 * is extracted, and validated with the same Zod schema; on violation the
 * raw output is sent back with a repair instruction once. The
 * prototype's silent `JSON.parse`-and-hope fallback is banned here —
 * unsatisfiable output raises `SchemaViolationError`.
 */
export async function generateStructured<S extends z.ZodType>(
  model: LanguageModel,
  request: GenerationRequest,
  schema: S,
): Promise<StructuredResult<z.infer<S>>> {
  let lastIssues = "";
  let lastRaw: string | undefined;
  let jsonMode = jsonModeProviders.has(providerIdOf(model));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const repaired = attempt > 1;
    const system = repaired
      ? `${request.system}\n\nYour previous output violated the schema. Return corrected output satisfying the schema exactly.`
      : request.system;
    const prompt = repaired
      ? `${request.prompt}\n\nPrevious output that violated the schema:\n${lastRaw ?? "(none)"}\n\nSchema violations: ${lastIssues}\n\nReturn output that satisfies the schema.`
      : request.prompt;
    const common = {
      model,
      temperature: request.temperature ?? 0,
      ...(request.seed === undefined ? {} : { seed: request.seed }),
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
    };

    if (!jsonMode) {
      let result: Awaited<ReturnType<typeof generateObject>>;
      try {
        result = await generateObject({ ...common, schema, system, prompt });
      } catch (err) {
        if (err instanceof NoObjectGeneratedError) {
          lastRaw = err.text ?? undefined;
          lastIssues =
            err.cause instanceof Error
              ? err.cause.message.slice(0, 2000)
              : "output was not valid JSON conforming to the schema";
          continue;
        }
        if (isSchemaUnsupportedError(err)) {
          // The provider cannot express this schema natively; remember it
          // and spend the next attempt in JSON-text mode.
          jsonModeProviders.add(providerIdOf(model));
          jsonMode = true;
          lastRaw = undefined;
          lastIssues = "provider rejected the native schema; retrying in JSON mode";
          continue;
        }
        throw new LlmRuntimeError(
          `Provider call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // The SDK validated against the schema already; re-validate cheaply
      // for a uniform code path.
      const parsed = schema.safeParse(result.object);
      if (parsed.success) {
        return {
          object: parsed.data as z.infer<S>,
          rawText: undefined,
          finishReason: result.finishReason,
          usage: toUsage(result.usage),
          attempts: attempt,
        };
      }
      lastRaw = JSON.stringify(result.object);
      lastIssues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")
        .slice(0, 2000);
      continue;
    }

    // JSON-text mode: schema goes into the prompt, reply is extracted,
    // parsed, and validated by us.
    const js = jsonSchema(z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }));
    let text: string;
    let finishReason: string | undefined;
    let usage: unknown;
    try {
      const r = await generateText({
        ...common,
        system: `${system}\n\nReturn ONLY a single JSON object that validates against this JSON Schema. No markdown fences, no commentary, no text before or after.\nSchema:\n${JSON.stringify(js)}`,
        prompt,
      });
      text = r.text;
      finishReason = r.finishReason;
      usage = r.usage;
    } catch (err) {
      throw new LlmRuntimeError(
        `Provider call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const extracted = extractJsonObject(text);
    if (!extracted.ok) {
      lastRaw = text;
      lastIssues = extracted.reason;
      continue;
    }
    const parsed = schema.safeParse(extracted.value);
    if (parsed.success) {
      return {
        object: parsed.data as z.infer<S>,
        rawText: text,
        finishReason,
        usage: toUsage(usage),
        attempts: attempt,
      };
    }
    lastRaw = text;
    lastIssues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ")
      .slice(0, 2000);
  }

  throw new SchemaViolationError(
    `Model output violated the schema after ${MAX_ATTEMPTS} attempts`,
    MAX_ATTEMPTS,
    lastIssues,
  );
}
