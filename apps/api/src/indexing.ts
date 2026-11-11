/**
 * Semantic indexing: resume text → chunks → pgvector embeddings.
 *
 * Indexing is best-effort by design: an embedding-provider outage must
 * never block a resume upload. Callers wrap failures; the search route
 * falls back to keyword matching for unindexed documents, so search keeps
 * working (semantically when embeddings exist, lexically otherwise).
 */

import type { EmbeddingModel, EmbeddingQueryTask } from "@candidlens/core";
import {
  chunkText,
  createEmbeddingModel,
  EMBEDDING_MODEL_ID,
  embedChunkTexts,
  embedQuery,
  readSetting,
} from "@candidlens/core";
import type { Database } from "@candidlens/db";
import { chunks } from "@candidlens/db";
import { eq } from "drizzle-orm";

/** Batch size for embedMany calls — a resume is ~5-15 chunks. */
const MAX_CHUNKS_PER_CALL = 96;

/** Index one document's raw text into the chunks table. Returns chunk count. */
export async function indexDocument(
  db: Database,
  embeddingModel: EmbeddingModel,
  documentId: string,
  rawText: string,
): Promise<number> {
  const pieces = chunkText(rawText);
  if (pieces.length === 0) return 0;
  // Embed every chunk before touching the table: when the provider fails,
  // the document keeps the chunks it already had.
  const vectors: number[][] = [];
  for (let i = 0; i < pieces.length; i += MAX_CHUNKS_PER_CALL) {
    const batch = pieces.slice(i, i + MAX_CHUNKS_PER_CALL);
    vectors.push(
      ...(await embedChunkTexts(
        embeddingModel,
        batch.map((p) => p.text),
      )),
    );
  }
  // Replace the document's chunks in one step so re-indexing is idempotent.
  await db.transaction(async (tx) => {
    await tx.delete(chunks).where(eq(chunks.documentId, documentId));
    await tx.insert(chunks).values(
      pieces.map((p, j) => ({
        documentId,
        text: p.text,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
        embedding: vectors[j],
      })),
    );
  });
  return pieces.length;
}

/** A tiny handle the routes/ingest use without importing the AI SDK. */
export interface CandidLensIndexer {
  modelId: string;
  indexDocument(documentId: string, rawText: string): Promise<number>;
  embedQuery(text: string, task?: EmbeddingQueryTask): Promise<number[]>;
}

export function createIndexer(db: Database, embeddingModel: EmbeddingModel): CandidLensIndexer {
  return {
    modelId: EMBEDDING_MODEL_ID,
    indexDocument: (documentId: string, rawText: string) =>
      indexDocument(db, embeddingModel, documentId, rawText),
    embedQuery: (text: string, task?: EmbeddingQueryTask) => embedQuery(embeddingModel, text, task),
  };
}

/**
 * The provider's reason an embedding call failed, for the log. Only the
 * message: the SDK's error object also carries the request body, which is
 * resume text.
 */
export function embeddingFailureReason(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}

/**
 * The key for embeddings. They always call Google (createEmbeddingModel),
 * so only a Google key may be used: the dedicated embedding key, else the
 * model key when Google is the model provider, else Google's key from the
 * failover chain. Another provider's key must never be sent to Google, and
 * resume text must not go to Google unless a Google key was configured.
 */
export function embeddingApiKeyFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const dedicated = readSetting("EMBEDDING_API_KEY", env)?.trim();
  if (dedicated) return dedicated;
  const provider = readSetting("LLM_PROVIDER", env)?.trim().toLowerCase();
  const modelKey = readSetting("LLM_API_KEY", env)?.trim();
  if (provider === "google" && modelKey) return modelKey;
  return readSetting("LLM_GOOGLE_API_KEY", env)?.trim() || undefined;
}

/** Resolve the embedding model from env. Null → keyword-search fallback. */
export function embeddingModelFromEnv(env: NodeJS.ProcessEnv): EmbeddingModel | null {
  const apiKey = embeddingApiKeyFromEnv(env);
  return apiKey ? createEmbeddingModel(apiKey) : null;
}
