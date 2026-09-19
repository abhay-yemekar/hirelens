/**
 * Semantic search over a job's resumes.
 *
 * GET  /search?q=…   — ranked hits: pgvector cosine KNN when the corpus is
 *                      embedded, ILIKE keyword scoring otherwise (and a mix:
 *                      keyword rows fill in for unindexed documents).
 * POST /ask          — LLM answer over the top hits, citations verified
 *                      server-side against the retrieved chunk set.
 * POST /index        — backfill embeddings for every unindexed document in
 *                      the job (used after enabling an embedding key, or for
 *                      resumes uploaded before semantic search shipped).
 *
 * All routes are org-scoped via loadOrgJob and honor blind review: labels
 * are masked when the caller is in blind mode, exactly like the review
 * queue, so Ask answers and search results can't leak identities.
 */

import { synthesizeAnswer } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { candidates, chunks, documents } from "@hirelens/db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { ApiInputError } from "../errors.js";
import { readJson } from "../http.js";
import { labelFromFileKey } from "../labels.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Max hits returned; keeps Ask prompts and payloads bounded. */
const MAX_HITS = 10;
/** Cosine distance above this is treated as "not relevant". */
const MAX_COSINE_DISTANCE = 0.85;
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

    if (corpus.length === 0) {
      return c.json({ ok: true, mode: "empty", hits: [], indexed: 0, total: 0 });
    }

    // --- semantic path (when embeddings exist) ---
    let semantic: CandidateHit[] = [];
    let embeddingMeta: string | null = null;
    const indexer = c.get("indexer");
    if (indexer && !mode) {
      try {
        const vector = await indexer.embedQuery(q);
        const rows = await db
          .select({
            chunkId: chunks.id,
            candidateId: candidates.id,
            sourceFileKey: candidates.sourceFileKey,
            distance: sql<number>`${chunks.embedding} <=> ${JSON.stringify(vector)}::vector`,
            text: chunks.text,
          })
          .from(chunks)
          .innerJoin(documents, eq(chunks.documentId, documents.id))
          .innerJoin(candidates, eq(documents.candidateId, candidates.id))
          .where(and(eq(candidates.jobId, job.id), sql`${chunks.embedding} is not null`))
          .orderBy(sql`${chunks.embedding} <=> ${JSON.stringify(vector)}::vector`)
          .limit(MAX_HITS * 2);
        const seen = new Map<string, CandidateHit>();
        for (const r of rows) {
          if (r.distance > MAX_COSINE_DISTANCE) continue;
          const prev = seen.get(r.candidateId);
          if (!prev || r.distance < prev.score) {
            seen.set(r.candidateId, {
              candidateId: r.candidateId,
              label: label(r.sourceFileKey),
              score: r.distance,
            });
          }
        }
        semantic = [...seen.values()].sort((a, b) => a.score - b.score).slice(0, MAX_HITS);
        embeddingMeta = indexer.modelId;
      } catch {
        // Provider outage → fall through to keyword mode.
      }
    }

    // --- keyword path (fallback + coverage for unindexed docs) ---
    const kwTerms = q
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 2)
      .slice(0, 8);
    const keyword: CandidateHit[] = [];
    if (kwTerms.length > 0) {
      const scored = corpus.map((doc) => {
        const lower = doc.rawText.toLowerCase();
        let score = 0;
        for (const t of kwTerms) {
          const matches = lower.split(t).length - 1;
          if (matches > 0) score += 1 + Math.log2(matches);
        }
        return { candidateId: doc.candidateId, label: label(doc.sourceFileKey), score };
      });
      keyword.push(
        ...scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_HITS),
      );
    }

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
      hits,
    });
  });

  /** POST /ask — LLM answer grounded in retrieved chunks; citations verified. */
  routes.post("/ask", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    const model = c.get("model");
    if (!model) return c.json({ ok: false, error: "llm_not_configured" }, 503);

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
        const vector = await indexer.embedQuery(question);
        const rows = await db
          .select({
            chunkId: chunks.id,
            candidateId: candidates.id,
            sourceFileKey: candidates.sourceFileKey,
            distance: sql<number>`${chunks.embedding} <=> ${JSON.stringify(vector)}::vector`,
            text: chunks.text,
          })
          .from(chunks)
          .innerJoin(documents, eq(chunks.documentId, documents.id))
          .innerJoin(candidates, eq(documents.candidateId, candidates.id))
          .where(and(eq(candidates.jobId, job.id), sql`${chunks.embedding} is not null`))
          .orderBy(sql`${chunks.embedding} <=> ${JSON.stringify(vector)}::vector`)
          .limit(12);
        pool.push(...rows.filter((r) => r.distance <= MAX_COSINE_DISTANCE));
      } catch {
        // fall through to keyword windows
      }
    }
    if (pool.length === 0) {
      // Keyword windows: for each doc take the best-matching slice.
      const terms = question
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((t) => t.length >= 2)
        .slice(0, 8);
      for (const doc of corpus) {
        if (pool.length >= 12) break;
        const lower = doc.rawText.toLowerCase();
        const best = { score: 0, pos: 0 };
        for (const t of terms) {
          const pos = lower.indexOf(t);
          if (pos >= 0) best.score += 1;
          if (pos >= 0 && best.pos === 0) best.pos = pos;
        }
        if (best.score > 0) {
          const start = Math.max(0, best.pos - 400);
          const window = doc.rawText.slice(start, start + 1200);
          pool.push({
            chunkId: `kw-${doc.documentId}-${start}`,
            candidateId: doc.candidateId,
            sourceFileKey: doc.sourceFileKey,
            text: window,
          });
        }
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
    );

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
            "Set HIRELENS_EMBEDDING_API_KEY (or reuse the LLM key — Google embeddings are used automatically) to enable semantic indexing.",
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
    for (const d of docs) {
      try {
        await indexer.indexDocument(d.documentId, d.rawText);
        indexed += 1;
      } catch {
        // Keep going — partial indexing is fine; keyword fallback covers gaps.
      }
    }
    const total = docs.length;
    return c.json({ ok: true, indexed, total });
  });

  return routes;
}

async function countIndexed(db: Database, jobId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${documents.id})` })
    .from(documents)
    .innerJoin(candidates, eq(documents.candidateId, candidates.id))
    .innerJoin(chunks, eq(chunks.documentId, documents.id))
    .where(and(eq(candidates.jobId, jobId), sql`${chunks.embedding} is not null`));
  return row?.n ?? 0;
}
