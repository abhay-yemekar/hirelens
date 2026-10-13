/**
 * Unit tests for HIRELENS_LLM_* env parsing. Regression suite for the
 * production incident where a Groq fallback without HIRELENS_LLM_GROQ_MODEL
 * inherited the primary's model id ("gemini-2.5-flash") and Groq rejected
 * it with "model does not exist" — masking the primary's real overload
 * error. Fallbacks must now fail config validation at boot.
 */
import { describe, expect, it } from "vitest";
import { readLlmEnv } from "../src/env.js";
import { ApiInputError } from "../src/errors.js";
import { isLlmMisconfiguredError, llmRouteError } from "../src/llm-error.js";
import { modelFromEnv } from "../src/model.js";

describe("readLlmEnv fallback validation", () => {
  it("returns null when no LLM env is set at all", () => {
    expect(readLlmEnv({})).toBeNull();
  });

  it("accepts a complete fallback config with its own model", () => {
    const llm = readLlmEnv({
      HIRELENS_LLM_PROVIDER: "google",
      HIRELENS_LLM_MODEL: "gemini-2.5-flash",
      HIRELENS_LLM_API_KEY: "g-key",
      HIRELENS_LLM_FALLBACKS: "groq",
      HIRELENS_LLM_GROQ_API_KEY: "q-key",
      HIRELENS_LLM_GROQ_MODEL: "openai/gpt-oss-120b",
    });
    expect(llm).not.toBeNull();
    expect(llm?.fallbacks).toEqual([
      {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        apiKey: "q-key",
      },
    ]);
  });

  it("throws a clear error when a fallback has no model of its own", () => {
    expect(() =>
      readLlmEnv({
        HIRELENS_LLM_PROVIDER: "google",
        HIRELENS_LLM_MODEL: "gemini-2.5-flash",
        HIRELENS_LLM_API_KEY: "g-key",
        HIRELENS_LLM_FALLBACKS: "groq",
        HIRELENS_LLM_GROQ_API_KEY: "q-key",
        // HIRELENS_LLM_GROQ_MODEL deliberately missing
      }),
    ).toThrow(/HIRELENS_LLM_GROQ_MODEL is required/);
  });

  it("the error message names the primary's model it must NOT inherit", () => {
    try {
      readLlmEnv({
        HIRELENS_LLM_PROVIDER: "google",
        HIRELENS_LLM_MODEL: "gemini-2.5-flash",
        HIRELENS_LLM_API_KEY: "g-key",
        HIRELENS_LLM_FALLBACKS: "groq",
      });
      expect.unreachable("readLlmEnv should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("never inherit");
      expect((err as Error).message).toContain("gemini-2.5-flash");
    }
  });
});

describe("modelFromEnv", () => {
  it("builds a working chain when every fallback carries its model", () => {
    const model = modelFromEnv(
      readLlmEnv({
        HIRELENS_LLM_PROVIDER: "google",
        HIRELENS_LLM_MODEL: "gemini-2.5-flash",
        HIRELENS_LLM_API_KEY: "g",
        HIRELENS_LLM_FALLBACKS: "groq",
        HIRELENS_LLM_GROQ_API_KEY: "q",
        HIRELENS_LLM_GROQ_MODEL: "openai/gpt-oss-120b",
      }),
    );
    expect(model).not.toBeNull();
  });

  it("returns the plain primary model when no fallbacks are configured", () => {
    const model = modelFromEnv(
      readLlmEnv({
        HIRELENS_LLM_PROVIDER: "google",
        HIRELENS_LLM_MODEL: "gemini-2.5-flash",
        HIRELENS_LLM_API_KEY: "g",
      }),
    );
    expect(model).not.toBeNull();
  });
});

describe("llm error classification", () => {
  it("maps model-not-found to typed llm_misconfigured", () => {
    const err = llmRouteError(
      "Rubric drafting failed",
      new Error(
        "Provider call failed: The model `gemini-2.5-flash` does not exist or you do not have access to it.",
      ),
    );
    expect(err).toBeInstanceOf(ApiInputError);
    expect(err.code).toBe("llm_misconfigured");
    expect(err.status).toBe(503);
    expect(err.message).toContain("HIRELENS_LLM");
  });

  it("maps invalid api keys to typed llm_misconfigured", () => {
    const err = llmRouteError("X", new Error("invalid_api_key: bad token"));
    expect(err.code).toBe("llm_misconfigured");
  });

  it("keeps transient overload as bad_response", () => {
    const err = llmRouteError(
      "X",
      new Error("Provider call failed: This model is currently experiencing high demand."),
    );
    expect(err.code).toBe("bad_response");
    expect(err.status).toBe(502);
  });

  it("classifies non-instant errors by message text alone", () => {
    // A plain error (not an AllProvidersFailedError instance) whose text
    // carries the misconfiguration signatures must still route to the
    // typed error — message matching is the fallback classifier.
    const raw = new Error(
      "All 2 providers failed: google: high demand; groq: model does not exist",
    );
    expect(isLlmMisconfiguredError(raw)).toBe(true);
    const typed = llmRouteError("X", raw);
    expect(typed.code).toBe("llm_misconfigured");
    expect(typed.status).toBe(503);
  });
});
