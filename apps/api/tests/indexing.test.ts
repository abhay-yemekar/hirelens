/**
 * Re-indexing a resume must not lose its stored chunks when the embedding
 * provider fails (#203): Google shut text-embedding-004 down, and every
 * index call failed after the old chunks were already deleted.
 */

import type { EmbeddingModel } from "@candidlens/core";
import type { Database } from "@candidlens/db";
import { describe, expect, it } from "vitest";
import { embeddingFailureReason, indexDocument } from "../src/indexing.js";

function embedder(doEmbed: (values: string[]) => Promise<number[][]>): EmbeddingModel {
  return {
    specificationVersion: "v4",
    provider: "test",
    modelId: "test-embedder",
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: true,
    doEmbed: async ({ values }: { values: string[] }) => ({
      embeddings: await doEmbed(values),
      warnings: [],
    }),
  } as unknown as EmbeddingModel;
}

/** Records what indexDocument does to the chunks table. */
function recordingDb() {
  const steps: string[] = [];
  const tx = {
    delete: () => ({
      where: async () => {
        steps.push("delete");
      },
    }),
    insert: () => ({
      values: async (rows: unknown[]) => {
        steps.push(`insert ${rows.length}`);
      },
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<void>) => {
      steps.push("begin");
      await fn(tx);
      steps.push("commit");
    },
    delete: tx.delete,
    insert: tx.insert,
  } as unknown as Database;
  return { db, steps };
}

const RESUME = "Jordan Avery\nSenior Backend Engineer\nLed the payments migration to Kubernetes.";

describe("indexDocument", () => {
  it("leaves the stored chunks alone when the provider fails", async () => {
    const { db, steps } = recordingDb();
    const failing = embedder(async () => {
      throw new Error("models/text-embedding-004 is not found for API version v1beta");
    });
    await expect(indexDocument(db, failing, "doc-1", RESUME)).rejects.toThrow("is not found");
    expect(steps).toEqual([]);
  });

  it("replaces the chunks in one transaction once every chunk is embedded", async () => {
    const { db, steps } = recordingDb();
    const working = embedder(async (values) =>
      values.map(() => Array.from({ length: 768 }, () => 0.1)),
    );
    await expect(indexDocument(db, working, "doc-1", RESUME)).resolves.toBe(1);
    expect(steps).toEqual(["begin", "delete", "insert 1", "commit"]);
  });
});

describe("embeddingFailureReason", () => {
  it("keeps the provider's message and drops the request body", () => {
    const err = Object.assign(new Error("models/x is not found"), {
      requestBodyValues: { requests: [{ content: { parts: [{ text: RESUME }] } }] },
    });
    const reason = embeddingFailureReason(err);
    expect(reason).toBe("models/x is not found");
    expect(reason).not.toContain("Jordan");
  });
});
