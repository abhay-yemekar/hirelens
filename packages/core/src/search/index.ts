import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { EmbeddingModel } from "ai";
import { embed, embedMany } from "ai";
import { z } from "zod";
import { generateStructured } from "../llm/generate.js";
import type { LanguageModel } from "../llm/index.js";

/**
 * Document chunking for semantic search.
 *
 * Chunks are anchored to (startOffset, endOffset) so any hit can be shown
 * in the resume context — the same spans the evidence viewer already uses.
 */
export const CHUNK_TARGET_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 150;

export interface TextChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

/** Whitespace-aligned chunker: fixed target size, overlap, never splits mid-word. */
export function chunkText(text: string): TextChunk[] {
  if (text.trim().length === 0) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_TARGET_CHARS, text.length);
    if (end < text.length) {
      // Walk back to the last whitespace so words stay whole.
      while (end > start + CHUNK_TARGET_CHARS / 2 && !/\s/.test(text[end] ?? "")) end -= 1;
    }
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({ text: slice, startOffset: start, endOffset: end });
    }
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
    if (start < 0) start = 0;
    // Guard against a non-advancing loop when the back-walk hit the midpoint floor.
    const lastStart = chunks.length > 0 ? (chunks[chunks.length - 1]?.startOffset ?? -1) : -1;
    if (start <= lastStart) start = end;
  }
  return chunks;
}

/** Google embedding model matching the DB schema's vector(768) columns. */
export const EMBEDDING_MODEL_ID = "google/text-embedding-004";
export const EMBEDDING_DIMENSIONS = 768;

/** Build the embedding model from a provider API key (Google AI studio). */
export function createEmbeddingModel(apiKey: string): EmbeddingModel {
  const google = createGoogleGenerativeAI({ apiKey });
  return google.textEmbeddingModel("text-embedding-004");
}

/** Embed a batch of chunk texts. */
export async function embedChunkTexts(model: EmbeddingModel, texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings;
}

/** Embed a search question. */
export async function embedQuery(model: EmbeddingModel, question: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: question });
  return embedding;
}

/** Sort key for ranking hits. */
export interface SearchHit {
  candidateId: string;
  label: string | null;
  documentId: string;
  chunkId: string;
  snippet: string;
  startOffset: number;
  endOffset: number;
  score: number;
}

/**
 * Answer shape the LLM must produce. Every claim is tied to the chunk ids
 * it used, and confidence is the model's own honesty about coverage.
 */
export interface AskResult {
  answer: string;
  chunkIds: Array<{ chunkId: string; candidateId: string; label: string | null }>;
  confidence: "high" | "medium" | "low";
}

const AskSchema = z.object({
  answer: z.string().min(1).max(2000),
  usedChunkIds: z.array(z.string()).max(12),
  confidence: z.enum(["high", "medium", "low"]),
});

/**
 * LLM synthesis over retrieved chunks. The model only sees chunk ids and
 * may cite only those — the route verifies citations against the actually
 * retrieved set, so the answer can never invent a candidate.
 */
export async function synthesizeAnswer(
  model: LanguageModel,
  question: string,
  hits: SearchHit[],
): Promise<AskResult> {
  const context = hits
    .map(
      (h, i) =>
        `[${h.chunkId}] Candidate "${h.label ?? h.candidateId}" — from their resume:\n${h.snippet}`,
    )
    .join("\n\n---\n\n");

  const result = await generateStructured(
    model,
    {
      system: [
        "You are HireLens' screening assistant. You answer recruiter questions using ONLY the provided resume excerpts.",
        "Every claim must come from the excerpts. If the excerpts do not contain the answer, say so plainly.",
        "List the [chunk ids] you actually used. never invent ids or candidates.",
        "Be concise: 2-5 sentences for the answer.",
      ].join("\n"),
      prompt: `Question: ${question}\n\nResume excerpts:\n${context}`,
    },
    AskSchema,
  );

  const allowed = new Set(hits.map((h) => h.chunkId));
  const byId = new Map(hits.map((h) => [h.chunkId, h]));
  const chunkIds = result.object.usedChunkIds
    .filter((id): id is string => typeof id === "string" && allowed.has(id))
    .slice(0, 12)
    .map((id) => {
      const hit = byId.get(id)!;
      return { chunkId: id, candidateId: hit.candidateId, label: hit.label };
    });

  return {
    answer: result.object.answer,
    chunkIds,
    confidence: result.object.confidence,
  };
}
