import { generateObject, generateText, jsonSchema, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import type { LanguageModel } from "./config.js";
import type { GenerationRequest, StructuredResult, UsageInfo } from "./types.js";
import { AllProvidersFailedError, LlmRuntimeError, SchemaViolationError } from "./types.js";

const MAX_ATTEMPTS = 2;

/**
 * Transient provider failures (overload / rate limit / capacity errors like
 * Google's "This model is currently experiencing high demand") get their
 * own retry ladder, separate from the schema-repair loop: the AI SDK's
 * internal retries are quick, but free-tier spikes can outlast them.
 */
const TRANSIENT_MAX_RETRIES = 2;
const TRANSIENT_BASE_DELAY_MS = 5_000;
const TRANSIENT_MAX_DELAY_MS = 20_000;

/**
 * Test hook: tests call this to shrink the ladder's sleeps to near-zero.
 * Production code never calls it.
 */
let transientTestDelayMs: number | undefined;
export function setTransientRetryDelayForTests(ms: number | undefined): void {
  transientTestDelayMs = ms;
}

/**
 * Overall deadline for the transient retry ladder (and, via the failover
 * chain's per-provider ladder calls, the whole chain). Serverless hosts
 * kill the function at a hard limit; retries that would outlive it are
 * pointless — better to fail now with the real transient error than to
 * burn the budget then time out opaquely.
 *
 * Default 120s covers Vercel's default function max duration with headroom.
 * Self-hosters can raise it via HIRELENS_LLM_DEADLINE_MS.
 */
const DEFAULT_RETRY_DEADLINE_MS = 120_000;

function deadlineMs(): number {
  const raw = process.env["HIRELENS_LLM_DEADLINE_MS"];
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETRY_DEADLINE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1_000 ? Math.min(n, 600_000) : DEFAULT_RETRY_DEADLINE_MS;
}

/** Overload / capacity / rate-limit signatures across providers. */
export function isTransientProviderError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|529|500|503)\b|high demand|overloaded overload|rate.?limit|quota|resource.?exhausted|too many requests|try again later/i.test(
    message,
  );
}

/** Honor a provider's retry-after hint when it is a sane number of seconds. */
function retryAfterMs(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const headers = (err as { responseHeaders?: Record<string, unknown> }).responseHeaders;
  const raw = headers?.["retry-after"];
  const secs = typeof raw === "string" ? Number(raw) : NaN;
  if (Number.isFinite(secs) && secs > 0 && secs <= 120) return secs * 1_000;
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap one provider call in the transient retry ladder: up to
 * TRANSIENT_MAX_RETRIES extra attempts with 5s→20s exponential backoff
 * (plus jitter), or the provider's retry-after hint. Non-transient errors
 * rethrow immediately so the schema-repair / failover paths can classify
 * them.
 */
async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + deadlineMs();
  let lastErr: unknown;
  for (let retry = 0; retry <= TRANSIENT_MAX_RETRIES; retry++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (retry === TRANSIENT_MAX_RETRIES || !isTransientProviderError(err)) {
        throw lastErr;
      }
      const delay =
        transientTestDelayMs ??
        Math.min(
          TRANSIENT_MAX_DELAY_MS,
          retryAfterMs(err) ?? TRANSIENT_BASE_DELAY_MS * 2 ** retry,
        ) + Math.floor(Math.random() * 500);
      // Out of budget: no more sleep-and-retry — rethrow now so the
      // failure surfaces with the real provider error, not a host timeout.
      if (Date.now() + delay >= deadline) {
        throw lastErr;
      }
      await sleep(delay);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw lastErr;
}

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

/**
 * Provider rejection signatures for schemas the provider cannot express
 * natively.
 *
 * Google has shipped at least three flavors over time:
 * - "Proto field is not repeating, cannot start list." (nested array-of-arrays)
 * - `response_schema` mentions when the API rejects the generated schema
 * - "schema at properties.… must be a boolean or an object" — the current
 *   error when a tuple/tuple-item schema is sent to Google's schema
 *   converter (`items: [...]` in an array's schema). The AI SDK's
 *   JSON-schema→OpenAPI conversion produces that shape for Zod tuples.
 *
 * OpenAI-compatible strict structured output (Groq) rejects schemas it can't
 * enforce with "invalid JSON schema for response_format: …" (e.g. a property
 * missing from `required`, or tuple items).
 *
 * Anything matching is treated as "the provider can't take this schema
 * natively" → fall back to JSON-text mode (schema embedded in the prompt)
 * rather than surfacing a raw SDK error to the user.
 */
function isSchemaUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Proto field is not repeating") ||
    message.includes("response_schema") ||
    // Google's schema-structural rejections: "schema at <path> must be a
    // boolean or an object", "must be a valid schema", etc. — robust to
    // varied path wording by matching the stable prefix and clause.
    (message.includes("schema at ") && message.includes("must be a")) ||
    (message.includes("Invalid JSON payload received") && message.includes("Unknown name")) ||
    message.includes("invalid JSON schema for response_format")
  );
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
 * Minimal reachability probe for a provider/model: one tiny completion.
 * Returns latency; throws on failure so callers (Settings → provider test)
 * can show the reason. Budgeted at a few tokens — it must be cheap.
 */
export async function pingModel(model: LanguageModel): Promise<{ ok: true; latencyMs: number }> {
  const t0 = Date.now();
  await generateText({
    model,
    system: "Reply with the single word: pong",
    prompt: "ping",
    maxOutputTokens: 8,
  });
  return { ok: true, latencyMs: Date.now() - t0 };
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
        result = await withTransientRetry(() =>
          generateObject({ ...common, schema, system, prompt }),
        );
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
        // An aggregated chain failure must keep its identity so callers
        // can read per-provider attempts (error surface, classification).
        if (err instanceof AllProvidersFailedError) {
          throw err;
        }
        throw new LlmRuntimeError(
          `Provider call failed: ${err instanceof Error ? err.message : String(err)}`,
          providerIdOf(model) || undefined,
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
      const r = await withTransientRetry(() =>
        generateText({
          ...common,
          system: `${system}\n\nReturn ONLY a single JSON object that validates against this JSON Schema. No markdown fences, no commentary, no text before or after.\nSchema:\n${JSON.stringify(js)}`,
          prompt,
        }),
      );
      text = r.text;
      finishReason = r.finishReason;
      usage = r.usage;
    } catch (err) {
      // Same rule as the native path below the loop: keep the chain
      // aggregate's identity so per-provider attempts stay readable.
      if (err instanceof AllProvidersFailedError) {
        throw err;
      }
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
