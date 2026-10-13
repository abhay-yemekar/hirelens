import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LanguageModel } from "./config.js";
import { createFailoverModel, lastFailoverMetadata } from "./failover.js";
import { generateStructured, setTransientRetryDelayForTests } from "./generate.js";
import { AllProvidersFailedError } from "./types.js";

// Shrink transient-ladder sleeps so these tests stay fast.
setTransientRetryDelayForTests(1);

const Reply = z.object({ title: z.string(), score: z.number().min(0).max(100) });

/** Tiny fake LanguageModel skipping the SDK plumbing of createMockModel. */
function fakeModel(
  provider: string,
  behavior: "ok" | "overload" | "schema-reject" | "perma-fail" | "not-found",
  result: unknown = { title: "t", score: 80 },
): { model: LanguageModel; genCalls: { n: number } } {
  const genCalls = { n: 0 };
  const model = {
    specificationVersion: "v2" as const,
    provider,
    modelId: `${provider}-1`,
    async doGenerate(_opts: unknown) {
      genCalls.n += 1;
      // schema-reject models real providers: the *native structured-output*
      // request is rejected by request validation, while JSON-text replies
      // (post-fallback) succeed — so only the first call throws.
      if (behavior === "schema-reject" && genCalls.n === 1) {
        throw new Error("schema at properties.x.items must be a boolean or an object");
      }
      if (behavior === "ok" || behavior === "schema-reject") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          finishReason: "stop" as const,
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          warnings: [],
        };
      }
      if (behavior === "overload") {
        throw new Error(
          "AI_APICallError: This model is currently experiencing high demand. Please try again later.",
        );
      }
      if (behavior === "not-found") {
        throw new Error(
          "The model `gemini-2.5-flash` does not exist or you do not have access to it.",
        );
      }
      throw new Error("invalid_api_key: permanent provider config error");
    },
  } as unknown as LanguageModel;
  return { model, genCalls };
}

describe("createFailoverModel", () => {
  it("serves from the primary when it works", async () => {
    const a = fakeModel("google", "ok");
    const b = fakeModel("groq", "ok");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    const res = await generateStructured(chain, { system: "s", prompt: "p" }, Reply);
    expect(res.object).toEqual({ title: "t", score: 80 });
    expect(a.genCalls.n).toBe(1);
    expect(b.genCalls.n).toBe(0);
    expect(lastFailoverMetadata(chain)?.chainPosition).toBe(0);
    expect(lastFailoverMetadata(chain)?.servedBy).toBe("google");
  });

  it("fails over to the next provider on overload and records metadata", async () => {
    const a = fakeModel("google", "overload");
    const b = fakeModel("groq", "ok");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    const res = await generateStructured(chain, { system: "s", prompt: "p" }, Reply);
    expect(res.object).toEqual({ title: "t", score: 80 });
    expect(a.genCalls.n).toBe(1);
    expect(b.genCalls.n).toBe(1);
    expect(lastFailoverMetadata(chain)?.servedBy).toBe("groq");
    expect(lastFailoverMetadata(chain)?.tried).toBe(2);
  });

  it("does NOT fail over on schema rejection — the repair path handles it on the same provider", async () => {
    const a = fakeModel("google", "schema-reject");
    const b = fakeModel("groq", "ok");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    // google rejects the native schema → JSON-text mode on google → ok.
    const res = await generateStructured(chain, { system: "s", prompt: "p" }, Reply);
    expect(res.object).toEqual({ title: "t", score: 80 });
    // groq must never be touched by a schema problem.
    expect(b.genCalls.n).toBe(0);
    expect(a.genCalls.n).toBeGreaterThanOrEqual(2);
    expect(lastFailoverMetadata(chain)?.servedBy).toBe("google");
  });

  it("propagates permanent errors without jumping providers", async () => {
    const a = fakeModel("google", "perma-fail");
    const b = fakeModel("groq", "ok");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    await expect(generateStructured(chain, { system: "s", prompt: "p" }, Reply)).rejects.toThrow(
      /invalid_api_key/,
    );
    expect(b.genCalls.n).toBe(0);
  });

  it("reports a clear error when every provider in the chain transiently fails", async () => {
    const a = fakeModel("google", "overload");
    const b = fakeModel("groq", "overload");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    await expect(generateStructured(chain, { system: "s", prompt: "p" }, Reply)).rejects.toThrow(
      /All 2 providers failed/,
    );
  });

  // Regression for the production incident: primary overloaded → fallback
  // (Groq) was called with the primary's model id and returned
  // "model does not exist". A fallback's non-transient error must be
  // RECORDED, not rethrown, and the chain must continue — then the
  // aggregated error names both providers so the real cause (primary
  // overload) and the misconfiguration (wrong fallback model) both show.
  it("continues past a fallback's model-not-found and aggregates both failures", async () => {
    const a = fakeModel("google", "overload");
    const b = fakeModel("groq", "not-found");
    const c = fakeModel("cerebras", "ok");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
      { id: "cerebras", model: c.model },
    ]);
    const res = await generateStructured(chain, { system: "s", prompt: "p" }, Reply);
    expect(res.object).toEqual({ title: "t", score: 80 });
    expect(b.genCalls.n).toBe(1);
    expect(c.genCalls.n).toBe(1);
    expect(lastFailoverMetadata(chain)?.servedBy).toBe("cerebras");
  });

  it("aggregates every provider's error when the whole chain fails on mixed causes", async () => {
    const a = fakeModel("google", "overload");
    const b = fakeModel("groq", "not-found");
    const chain = createFailoverModel([
      { id: "google", model: a.model },
      { id: "groq", model: b.model },
    ]);
    const err = await generateStructured(chain, { system: "s", prompt: "p" }, Reply).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    const agg = err as AllProvidersFailedError;
    expect(agg.attempts).toEqual([
      { provider: "google", message: expect.stringContaining("high demand") },
      { provider: "groq", message: expect.stringContaining("does not exist") },
    ]);
    expect(agg.message).toContain("google:");
    expect(agg.message).toContain("groq:");
  });

  it("rejects an empty chain", () => {
    expect(() => createFailoverModel([])).toThrow(/at least one/);
  });
});
