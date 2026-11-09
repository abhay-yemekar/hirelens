/**
 * Embeddings always call Google, so only a Google key may reach them.
 * Regression suite for #184: the model key was reused whatever the
 * provider, sending an Anthropic/Groq/… key and resume text to Google.
 */
import { describe, expect, it } from "vitest";
import { embeddingApiKeyFromEnv, embeddingModelFromEnv } from "../src/indexing.js";

describe("embeddingApiKeyFromEnv", () => {
  it("uses the dedicated embedding key first", () => {
    expect(
      embeddingApiKeyFromEnv({
        CANDIDLENS_EMBEDDING_API_KEY: "embed-key",
        CANDIDLENS_LLM_PROVIDER: "google",
        CANDIDLENS_LLM_API_KEY: "model-key",
      }),
    ).toBe("embed-key");
  });

  it("reuses the model key when Google is the model provider", () => {
    expect(
      embeddingApiKeyFromEnv({
        CANDIDLENS_LLM_PROVIDER: "google",
        CANDIDLENS_LLM_API_KEY: "g-key",
      }),
    ).toBe("g-key");
  });

  it.each(["anthropic", "groq", "openrouter", "mistral", "cerebras", "ollama"])(
    "never reuses a %s model key",
    (provider) => {
      const env = { CANDIDLENS_LLM_PROVIDER: provider, CANDIDLENS_LLM_API_KEY: "other-key" };
      expect(embeddingApiKeyFromEnv(env)).toBeUndefined();
      expect(embeddingModelFromEnv(env)).toBeNull();
    },
  );

  it("uses Google's failover key when the primary is another provider", () => {
    expect(
      embeddingApiKeyFromEnv({
        CANDIDLENS_LLM_PROVIDER: "groq",
        CANDIDLENS_LLM_API_KEY: "q-key",
        CANDIDLENS_LLM_GOOGLE_API_KEY: "g-key",
      }),
    ).toBe("g-key");
  });

  it("still reads the old HIRELENS_ names", () => {
    expect(
      embeddingApiKeyFromEnv({ HIRELENS_LLM_PROVIDER: "google", HIRELENS_LLM_API_KEY: "g-key" }),
    ).toBe("g-key");
    expect(
      embeddingApiKeyFromEnv({ HIRELENS_LLM_PROVIDER: "groq", HIRELENS_LLM_API_KEY: "q-key" }),
    ).toBeUndefined();
  });

  it("treats empty and blank values as unset", () => {
    expect(
      embeddingApiKeyFromEnv({
        CANDIDLENS_EMBEDDING_API_KEY: "  ",
        CANDIDLENS_LLM_PROVIDER: "google",
        CANDIDLENS_LLM_API_KEY: "",
      }),
    ).toBeUndefined();
    expect(embeddingModelFromEnv({})).toBeNull();
  });
});
