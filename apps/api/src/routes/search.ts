/**
 * Semantic search over a job's resumes.
 *
 * GET  /search?q=…   — ranked hits: resumes that match the query by meaning
 *                      (pgvector cosine distance, kept by matchesByMeaning)
 *                      merged with keyword scoring, which also covers
 *                      unindexed documents.
 * POST /ask          — LLM answer over the closest chunks of the resumes
 *                      that match by meaning (keyword windows otherwise),
 *                      citations verified against the retrieved chunk set.
 * POST /index        — (re-)embed every resume in the job (used after
 *                      enabling an embedding key, after an embedding model
 *                      change, or for resumes uploaded while it failed).
 *
 * All routes are org-scoped via loadOrgJob and honor blind review: labels
 * are masked when the caller is in blind mode, exactly like the review
 * queue, so Ask answers and search results can't leak identities.
 */

import { matchesByMeaning, rankByKeywords, synthesizeAnswer } from "@candidlens/core";
import type { Database } from "@candidlens/db";
import { candidates, chunks, documents } from "@candidlens/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { ApiInputError } from "../errors.js";
import { readJson } from "../http.js";
import { embeddingFailureReason } from "../indexing.js";
import { labelFromFileKey } from "../labels.js";
import { llmRouteError, requireLlmModel } from "../llm-error.js";
import { logger } from "../observability.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Max hits returned; keeps Ask prompts and payloads bounded. */
const MAX_HITS = 10;
/** Per-question cap on how much resume text we send to the LLM. */
const ASK_CONTEXT_CHARS = 8000;

const AskSchema = z.object({ question: z.string().min(3).max(500) });
const IndexSchema = z.object({}).optional();

interface CandidateHit {
  candidateId: string;
  label: string | null;
  score: number;
}

export function searchRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** GET /search?q=… — semantic + keyword hybrid. */
  routes.get("/search", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) {
      return c.json(
        { ok: false, error: "invalid_query", message: "Type at least 2 characters." },
        400,
      );
    }
    const blind = c.req.query("blind") === "1";
    const mode = c.req.query("mode") === "ask";

    // Corpus snapshot: every resume doc in this job.
    const corpus = await db
      .select({
        candidateId: candidates.id,
        sourceFileKey: candidates.sourceFileKey,
        documentId: documents.id,
        rawText: documents.rawText,
      })
      .from(documents)
      .innerJoin(candidates, eq(documents.candidateId, candidates.id))
      .where(eq(candidates.jobId, job.id));

    const label = (key: string | null): string | null =>
      blind ? null : (labelFromFileKey(key) ?? null);

    // Whether this server can embed: the web app offers its Index button
    // only then, since POST /index can't succeed without it.
    const indexer = c.get("indexer");
    const indexingEnabled = indexer !== null;

    if (corpus.length === 0) {
      return c.json({ ok: true, mode: "empty", hits: [], indexed: 0, total: 0, indexingEnabled });
    }

    // --- semantic path (when embeddings exist) ---
    let semantic: CandidateHit[] = [];
    let embeddingMeta: string | null = null;
    if (indexer && !mode) {
      try {
        const vector = await indexer.embedQuery(q);
        const nearest = await nearestByCandidate(db, job.id, vector);
        semantic = matchesByMeaning(nearest)
          .slice(0, MAX_HITS)
          .map((r) => ({
            candidateId: r.candidateId,
            label: label(r.sourceFileKey),
            score: r.distance,
          }));
        embeddingMeta = indexer.modelId;
      } catch (err) {
        // Provider outage → fall through to keyword mode.
        logger.warn(
          { jobId: job.id, reason: embeddingFailureReason(err) },
          "semantic search failed; answering from keywords",
        );
      }
    }

    // --- keyword path (fallback + coverage for unindexed docs) ---
    const keyword: CandidateHit[] = rankByKeywords(corpus, q, (doc) => doc.rawText)
      .slice(0, MAX_HITS)
      .map(({ doc, score }) => ({
        candidateId: doc.candidateId,
        label: label(doc.sourceFileKey),
        score,
      }));

    // --- merge: semantic ranking wins; keyword fills and boosts overlaps ---
    const merged = new Map<string, CandidateHit>();
    for (const [i, s] of semantic.entries()) {
      merged.set(s.candidateId, { ...s, score: 1 - i / (MAX_HITS + 1) });
    }
    for (const [i, k] of keyword.entries()) {
      const kwScore = 1 - i / (MAX_HITS + 1);
      const existing = merged.get(k.candidateId);
      if (existing) {
        existing.score = Math.min(1, existing.score + kwScore * 0.3);
      } else {
        merged.set(k.candidateId, { ...k, score: kwScore * 0.7 });
      }
    }
    const hits = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, MAX_HITS);

    const indexedCount = await countIndexed(db, job.id);
    return c.json({
      ok: true,
      mode: semantic.length > 0 ? "semantic+keyword" : "keyword",
      embeddingModel: embeddingMeta,
      indexed: indexedCount,
      total: corpus.length,
      indexingEnabled,
      hits,
    });
  });

  /** POST /ask — LLM answer grounded in retrieved chunks; citations verified. */
  routes.post("/ask", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const model = requireLlmModel(c);

    const parsed = AskSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json(
        { ok: false, error: "invalid_body", message: "Question must be 3-500 characters." },
        400,
      );
    }
    const question = parsed.data.question.trim();
    const blind = c.req.query("blind") === "1";

    // Retrieve top chunks: semantic if possible, else best-effort keyword windows.
    const corpus = await db
      .select({
        candidateId: candidates.id,
        sourceFileKey: candidates.sourceFileKey,
        documentId: documents.id,
        rawText: documents.rawText,
      })
      .from(documents)
      .innerJoin(candidates, eq(documents.candidateId, candidates.id))
      .where(eq(candidates.jobId, job.id));
    if (corpus.length === 0) {
      return c.json({ ok: true, answer: null, message: "No resumes uploaded yet.", citations: [] });
    }

    const label = (key: string | null): string | null =>
      blind ? null : (labelFromFileKey(key) ?? null);

    // Build retrieval pool: try semantic first, fall back to keyword windows.
    const pool: Array<{
      chunkId: string;
      candidateId: string;
      sourceFileKey: string | null;
      text: string;
    }> = [];
    const indexer = c.get("indexer");
    if (indexer) {
      try {
        const vector = await indexer.embedQuery(question, "question answering");
        // The closest chunks of the resumes that match by meaning; none
        // match → keyword windows below.
        const matched = matchesByMeaning(await nearestByCandidate(db, job.id, vector)).map(
          (r) => r.candidateId,
        );
        if (matched.length > 0) {
          const distance = sql`${chunks.embedding} <=> ${JSON.stringify(vector)}::vector`;
          const rows = await db
            .select({
              chunkId: chunks.id,
              candidateId: candidates.id,
              sourceFileKey: candidates.sourceFileKey,
              text: chunks.text,
            })
            .from(chunks)
            .innerJoin(documents, eq(chunks.documentId, documents.id))
            .innerJoin(candidates, eq(documents.candidateId, candidates.id))
            .where(
              and(
                eq(candidates.jobId, job.id),
                inArray(candidates.id, matched),
                sql`${chunks.embedding} is not null`,
              ),
            )
            .orderBy(distance)
            .limit(12);
          pool.push(...rows);
        }
      } catch (err) {
        // fall through to keyword windows
        logger.warn(
          { jobId: job.id, reason: embeddingFailureReason(err) },
          "semantic retrieval for Ask failed; using keyword windows",
        );
      }
    }
    if (pool.length === 0) {
      // Keyword windows: the best keyword matches, each as the slice of
      // its resume around the first matching term.
      for (const { doc, firstIndex } of rankByKeywords(corpus, question, (d) => d.rawText).slice(
        0,
        12,
      )) {
        const start = Math.max(0, firstIndex - 400);
        pool.push({
          chunkId: `kw-${doc.documentId}-${start}`,
          candidateId: doc.candidateId,
          sourceFileKey: doc.sourceFileKey,
          text: doc.rawText.slice(start, start + 1200),
        });
      }
    }
    if (pool.length === 0) {
      return c.json({
        ok: true,
        answer: null,
        message: "No matching passages found in the resumes for this question.",
        citations: [],
      });
    }

    // Budget the context (chars) across the pool, keeping per-chunk integrity.
    const budgeted: typeof pool = [];
    let used = 0;
    for (const p of pool) {
      if (used + p.text.length > ASK_CONTEXT_CHARS) break;
      budgeted.push(p);
      used += p.text.length;
    }
    const result = await synthesizeAnswer(
      model,
      question,
      budgeted.map((p) => ({
        candidateId: p.candidateId,
        label: label(p.sourceFileKey),
        documentId: "",
        chunkId: p.chunkId,
        snippet: p.text,
        startOffset: 0,
        endOffset: 0,
        score: 0,
      })),
    ).catch((err) => {
      // Provider/runtime or schema-violation failures surface as 502
      // Transient upstream problems → 502 bad_response; a wrong model id
      // or rejected key → 503 llm_misconfigured. Never an opaque 500.
      throw llmRouteError("The AI could not answer this question right now", err);
    });

    // Verify citations: only chunks actually sent may be cited.
    const sent = new Set(budgeted.map((p) => p.chunkId));
    const citations = result.chunkIds.filter((cRef: { chunkId: string }) => sent.has(cRef.chunkId));

    return c.json({
      ok: true,
      answer: result.answer,
      confidence: result.confidence,
      citations,
      blind,
    });
  });

  /** POST /index — backfill embeddings for all unindexed documents. */
  routes.post("/index", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    IndexSchema.safeParse(await readJson(c).catch(() => ({})));

    const indexer = c.get("indexer");
    if (!indexer) {
      return c.json(
        {
          ok: false,
          error: "embedding_not_configured",
          message:
            "Set CANDIDLENS_EMBEDDING_API_KEY to a Google AI key to enable semantic indexing. With CANDIDLENS_LLM_PROVIDER=google, the model key is used instead.",
        },
        503,
      );
    }

    const docs = await db
      .select({ documentId: documents.id, rawText: documents.rawText })
      .from(documents)
      .innerJoin(candidates, eq(documents.candidateId, candidates.id))
      .where(eq(candidates.jobId, job.id));

    let indexed = 0;
    let lastFailure: string | null = null;
    for (const d of docs) {
      try {
        await indexer.indexDocument(d.documentId, d.rawText);
        indexed += 1;
      } catch (err) {
        // Keep going — partial indexing is fine; keyword fallback covers gaps.
        lastFailure = embeddingFailureReason(err);
      }
    }
    const total = docs.length;
    if (lastFailure !== null) {
      logger.warn(
        { jobId: job.id, failed: total - indexed, total, reason: lastFailure },
        "semantic indexing failed for some resumes",
      );
    }
    return c.json({ ok: true, indexed, total });
  });

  return routes;
}

/**
 * Each embedded resume in the job with the cosine distance of its chunk
 * nearest to the query. matchesByMeaning compares every resume with the
 * others, so this reads them all rather than the top few chunks.
 */
async function nearestByCandidate(
  db: Database,
  jobId: string,
  vector: number[],
): Promise<Array<{ candidateId: string; sourceFileKey: string | null; distance: number }>> {
  return db
    .select({
      candidateId: candidates.id,
      sourceFileKey: candidates.sourceFileKey,
      distance: sql<number>`min(${chunks.embedding} <=> ${JSON.stringify(vector)}::vector)`.mapWith(
        Number,
      ),
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .innerJoin(candidates, eq(documents.candidateId, candidates.id))
    .where(and(eq(candidates.jobId, jobId), sql`${chunks.embedding} is not null`))
    .groupBy(candidates.id, candidates.sourceFileKey);
}

async function countIndexed(db: Database, jobId: string): Promise<number> {
  const [row] = await db
    // ::int — Postgres counts are bigint, which node-postgres returns as a
    // string, and the web app compares the count with the total.
    .select({ n: sql<number>`count(distinct ${documents.id})::int` })
    .from(documents)
    .innerJoin(candidates, eq(documents.candidateId, candidates.id))
    .innerJoin(chunks, eq(chunks.documentId, documents.id))
    .where(and(eq(candidates.jobId, jobId), sql`${chunks.embedding} is not null`));
  return row?.n ?? 0;
}
