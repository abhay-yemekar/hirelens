import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateStructured } from "./generate.js";
import {
  assertValidProviderConfig,
  createMockModel,
  type LanguageModel,
  LlmConfigError,
  LlmRuntimeError,
  type ProviderConfig,
  SchemaViolationError,
} from "./index.js";

const Reply = z.object({ title: z.string(), score: z.number().min(0).max(100) });

describe("generateStructured", () => {
  it("returns parsed object and usage on a well-formed first attempt", async () => {
    const { model, calls } = createMockModel({ args: { title: "t", score: 80 } });
    const res = await generateStructured(
      model as LanguageModel,
      { system: "s", prompt: "p" },
      Reply,
    );
    expect(res.object).toEqual({ title: "t", score: 80 });
    expect(res.attempts).toBe(1);
    expect(res.usage.totalTokens).toBe(30);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe("s");
    expect(calls[0]?.prompt).toBe("p");
    expect(calls[0]?.temperature).toBe(0);
  });

  it("repairs once when the first output violates the schema", async () => {
    const { model, calls } = createMockModel({
      argsPerCall: [
        { title: "t", score: 999 },
        { title: "t", score: 42 },
      ],
    });
    const res = await generateStructured(
      model as LanguageModel,
      { system: "s", prompt: "p" },
      Reply,
    );
    expect(res.object).toEqual({ title: "t", score: 42 });
    expect(res.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.system).toContain("violated the schema");
    expect(calls[1]?.prompt).toContain("Previous output that violated the schema");
  });

  it("throws SchemaViolationError when every attempt violates the schema", async () => {
    const { model, calls } = createMockModel({ args: { title: "t", score: 999 } });
    await expect(
      generateStructured(model as LanguageModel, { system: "s", prompt: "p" }, Reply),
    ).rejects.toBeInstanceOf(SchemaViolationError);
    expect(calls).toHaveLength(2);
  });

  it("falls back to JSON-text mode when a provider rejects the schema, and remembers it", async () => {
    const { model, calls } = createMockModel({
      provider: "rejecting-provider",
      failWithOnce: new Error(
        'Invalid JSON payload received. Unknown name "items" at ... Proto field is not repeating, cannot start list.',
      ),
      args: { title: "t", score: 80 },
    });
    const res = await generateStructured(
      model as LanguageModel,
      { system: "s", prompt: "p" },
      Reply,
    );
    expect(res.object).toEqual({ title: "t", score: 80 });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.system).toContain("JSON Schema");
  });

  it("wraps provider failures in LlmRuntimeError", async () => {
    const { model } = createMockModel({ failWith: new Error("boom") });
    await expect(
      generateStructured(model as LanguageModel, { system: "s", prompt: "p" }, Reply),
    ).rejects.toBeInstanceOf(LlmRuntimeError);
  });
});

describe("assertValidProviderConfig", () => {
  const valid: ProviderConfig = { id: "google", model: "gemini-3-flash", apiKey: "k" };

  it("accepts a hosted provider with key and model", () => {
    expect(() => assertValidProviderConfig(valid)).not.toThrow();
  });

  it("rejects hosted providers without a key and ollama without baseUrl", () => {
    expect(() => assertValidProviderConfig({ id: "google", model: "gemini-3-flash" })).toThrow(
      LlmConfigError,
    );
    expect(() => assertValidProviderConfig({ id: "ollama", model: "llama3" })).toThrow(/baseUrl/);
  });

  it("rejects empty model ids", () => {
    expect(() => assertValidProviderConfig({ ...valid, model: "  " })).toThrow(/model/);
  });
});
