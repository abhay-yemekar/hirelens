import { MockEmbeddingModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  chunkText,
  createEmbeddingModel,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  embedChunkTexts,
  embedQuery,
} from "./index.js";

describe("chunkText", () => {
  it("returns an empty array for blank input", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("keeps short documents as one chunk with real offsets", () => {
    const text = "Jane Doe — Senior Backend Engineer. Built payment systems at scale.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startOffset).toBe(0);
    expect(chunks[0]!.text.length).toBeLessThanOrEqual(text.length);
  });

  it("splits long documents into non-overlapping-order chunks within the target size", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Experience line ${i} with skills`).join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1210);
      expect(c.endOffset).toBeGreaterThan(c.startOffset);
    }
    // Chunks advance in document order without repeating a start.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startOffset).toBeGreaterThan(chunks[i - 1]!.startOffset);
    }
  });

  it("terminates on a document with no whitespace at all", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startOffset).toBeGreaterThan(chunks[i - 1]!.startOffset);
    }
  });
});

/** A model that returns `size` values per input and records each call. */
function fakeEmbedder(size = EMBEDDING_DIMENSIONS) {
  return new MockEmbeddingModelV4({
    // Google's limit, so a batch arrives as one call.
    maxEmbeddingsPerCall: 100,
    doEmbed: async ({ values }) => ({
      embeddings: values.map(() => Array.from({ length: size }, (_, i) => (i === 0 ? 1 : 0))),
      warnings: [],
    }),
  });
}

describe("embeddings", () => {
  it("uses gemini-embedding-2, since Google shut text-embedding-004 down", () => {
    expect(EMBEDDING_MODEL_ID).toBe("google/gemini-embedding-2");
    expect((createEmbeddingModel("test-key") as { modelId: string }).modelId).toBe(
      "gemini-embedding-2",
    );
  });

  it("sends chunks as untitled documents and asks for 768 values", async () => {
    const model = fakeEmbedder();
    const vectors = await embedChunkTexts(model, ["Built Kafka pipelines.", "Led SRE on-call."]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(768);
    const call = model.doEmbedCalls[0];
    expect(call?.values).toEqual([
      "title: none | text: Built Kafka pipelines.",
      "title: none | text: Led SRE on-call.",
    ]);
    expect(call?.providerOptions).toEqual({ google: { outputDimensionality: 768 } });
  });

  it("puts the query's task in front of it", async () => {
    const model = fakeEmbedder();
    await embedQuery(model, "payments experience");
    await embedQuery(model, "Who led a migration?", "question answering");
    expect(model.doEmbedCalls.map((c) => c.values[0])).toEqual([
      "task: search result | query: payments experience",
      "task: question answering | query: Who led a migration?",
    ]);
    expect(model.doEmbedCalls[1]?.providerOptions).toEqual({
      google: { outputDimensionality: 768 },
    });
  });

  it("refuses a vector the vector(768) column cannot hold", async () => {
    await expect(embedChunkTexts(fakeEmbedder(3072), ["x"])).rejects.toThrow(
      "google/gemini-embedding-2 returned 3072 values; search stores 768.",
    );
    await expect(embedQuery(fakeEmbedder(3072), "x")).rejects.toThrow("returned 3072 values");
  });
});
