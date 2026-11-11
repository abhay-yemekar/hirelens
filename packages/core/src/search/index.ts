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

/**
 * Google embedding model for the chunks table's vector(768) column. It
 * returns 3072 values unless asked for fewer; Google normalizes the
 * shortened vector. Vectors from two models can't be compared, so a new
 * model means re-indexing (POST /api/jobs/:id/index re-embeds every resume
 * in a job). The model before, text-embedding-004, was shut down on
 * 14 Jan 2026.
 */
const GOOGLE_EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_MODEL_ID = `google/${GOOGLE_EMBEDDING_MODEL}`;
export const EMBEDDING_DIMENSIONS = 768;

const EMBEDDING_OPTIONS = {
  google: { outputDimensionality: EMBEDDING_DIMENSIONS },
};

/** Build the embedding model from a provider API key (Google AI studio). */
export function createEmbeddingModel(apiKey: string): EmbeddingModel {
  const google = createGoogleGenerativeAI({ apiKey });
  return google.embeddingModel(GOOGLE_EMBEDDING_MODEL);
}

/**
 * What a query embedding is for. gemini-embedding-2 takes no task type, so
 * the task goes in front of the text in Google's documented format.
 */
export type EmbeddingQueryTask = "search result" | "question answering";

/** A resume chunk as gemini-embedding-2 expects a document. */
export function documentEmbeddingText(text: string): string {
  return `title: none | text: ${text}`;
}

/** A search or Ask question as gemini-embedding-2 expects a query. */
export function queryEmbeddingText(
  text: string,
  task: EmbeddingQueryTask = "search result",
): string {
  return `task: ${task} | query: ${text}`;
}

/** Refuse a vector the vector(768) column would reject or misread. */
function checkDimensions(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `${EMBEDDING_MODEL_ID} returned ${vector.length} values; search stores ${EMBEDDING_DIMENSIONS}.`,
    );
  }
  return vector;
}

/** Embed a batch of chunk texts. */
export async function embedChunkTexts(model: EmbeddingModel, texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model,
    values: texts.map(documentEmbeddingText),
    providerOptions: EMBEDDING_OPTIONS,
  });
  return embeddings.map(checkDimensions);
}

/** Embed a search question. */
export async function embedQuery(
  model: EmbeddingModel,
  question: string,
  task: EmbeddingQueryTask = "search result",
): Promise<number[]> {
  const { embedding } = await embed({
    model,
    value: queryEmbeddingText(question, task),
    providerOptions: EMBEDDING_OPTIONS,
  });
  return checkDimensions(embedding);
}

/**
 * How far a resume's distance must sit below the average of the job's
 * other resumes to count as a match by meaning. gemini-embedding-2 puts
 * unrelated text close together, so no fixed cosine distance separates a
 * match from noise; standing out from the rest of the job does. Chosen on
 * the 12 demo resumes with 28 labelled queries, then checked on 12 more.
 */
export const MEANING_MATCH_MARGIN = 0.035;

/**
 * The resumes that match a query by meaning, nearest first. Each row is
 * one resume with its nearest chunk's cosine distance; a resume matches
 * when that distance is at least MEANING_MATCH_MARGIN below the mean of
 * the other resumes' distances. A lone resume has nothing to compare with,
 * so it is kept.
 */
export function matchesByMeaning<T extends { distance: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => a.distance - b.distance);
  if (sorted.length < 2) return sorted;
  const total = sorted.reduce((sum, r) => sum + r.distance, 0);
  return sorted.filter(
    (r) => (total - r.distance) / (sorted.length - 1) - r.distance >= MEANING_MATCH_MARGIN,
  );
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
        "You are CandidLens' screening assistant. You answer recruiter questions using ONLY the provided resume excerpts.",
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
