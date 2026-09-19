/**
 * Semantic indexing: resume text → chunks → pgvector embeddings.
 *
 * Indexing is best-effort by design: an embedding-provider outage must
 * never block a resume upload. Callers wrap failures; the search route
 * falls back to keyword matching for unindexed documents, so search keeps
 * working (semantically when embeddings exist, lexically otherwise).
 */

import type { EmbeddingModel } from "@hirelens/core";
import {
  chunkText,
  createEmbeddingModel,
  EMBEDDING_MODEL_ID,
  embedChunkTexts,
  embedQuery,
} from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { chunks } from "@hirelens/db";
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
  // Clear prior chunks for this document so re-indexing is idempotent.
  await db.delete(chunks).where(eq(chunks.documentId, documentId));
  for (let i = 0; i < pieces.length; i += MAX_CHUNKS_PER_CALL) {
    const batch = pieces.slice(i, i + MAX_CHUNKS_PER_CALL);
    const vectors = await embedChunkTexts(
      embeddingModel,
      batch.map((p) => p.text),
    );
    await db.insert(chunks).values(
      batch.map((p, j) => ({
        documentId,
        text: p.text,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
        embedding: vectors[j],
      })),
    );
  }
  return pieces.length;
}

/** A tiny handle the routes/ingest use without importing the AI SDK. */
export interface HireLensIndexer {
  modelId: string;
  indexDocument(documentId: string, rawText: string): Promise<number>;
  embedQuery(text: string): Promise<number[]>;
}

export function createIndexer(db: Database, embeddingModel: EmbeddingModel): HireLensIndexer {
  return {
    modelId: EMBEDDING_MODEL_ID,
    indexDocument: (documentId: string, rawText: string) =>
      indexDocument(db, embeddingModel, documentId, rawText),
    embedQuery: (text: string) => embedQuery(embeddingModel, text),
  };
}

/** Resolve the embedding model from env. Null → keyword-search fallback. */
export function embeddingModelFromEnv(env: NodeJS.ProcessEnv): EmbeddingModel | null {
  const apiKey = env["HIRELENS_EMBEDDING_API_KEY"]?.trim() || env["HIRELENS_LLM_API_KEY"]?.trim();
  if (!apiKey) return null;
  return createEmbeddingModel(apiKey);
}
