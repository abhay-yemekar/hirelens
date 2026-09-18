/**
 * runBatch: creates the scoring_runs row, fans out per-candidate work
 * with bounded concurrency and rate-limit-aware retries, and closes the
 * run. Failures are recorded per candidate — persisted on the run row —
 * and never abort the whole batch or vanish silently.
 */

import { type LanguageModel, modelIdOf } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { candidates, documents, jobs, rubrics, scoringRuns } from "@hirelens/db";
import { desc, eq, inArray } from "drizzle-orm";
import { appendAudit } from "./audit.js";
import type { BatchSummary } from "./orchestrator.js";
import { type ScoreOneContext, type ScoreOneInvocation, scoreOneCandidate } from "./run.js";
import { noopTraceSink } from "./trace.js";

export interface RunBatchOptions extends ScoreOneContext {
  /** Max candidates scored concurrently. Default 2 (LLM rate limits). */
  concurrency?: number;
  /** Retry attempts per candidate. Default 5, rate-limit aware. */
  attempts?: number;
  /**
   * Score only these candidate IDs (retry-failed flows). Default: every
   * candidate on the job.
   */
  candidateIds?: string[];
  /**
   * Progress callback, invoked after each candidate settles. Transport-
   * agnostic: the API layer can bridge this to SSE for live progress.
   */
  onProgress?:
    | ((p: { completed: number; total: number; candidateId: string; ok: boolean }) => void)
    | undefined;
}

/** A candidate the batch could not score, persisted on the run row. */
export interface RunFailure {
  candidateId: string;
  label: string | null;
  error: string;
}

/**
 * Sleep for a rate-limit-aware delay. Provider rate-limit errors (429/503,
 * "quota", "rate limit") back off in 15 s steps up to a 60 s ceiling —
 * Gemini's free tier resets per-minute, so sub-second retries (the old
 * 50–200 ms ladder) burned every attempt inside one limit window. Other
 * errors retry quickly with jitter.
 */
function retryDelayMs(attempt: number, error: unknown): number {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const rateLimited =
    /\b429\b|\b503\b|rate.?limit|quota|resource.?exhausted|too many requests/.test(message);
  if (rateLimited) {
    return Math.min(60_000, 15_000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 1_000);
  }
  return Math.min(5_000, 200 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, retryDelayMs(i, err)));
    }
  }
  throw lastError;
}

/** Score candidates on a job against the job's latest rubric version. */
export async function runBatch(
  db: Database,
  model: LanguageModel,
  input: { jobId: string; orgId: string; actorId?: string | undefined },
  opts?: RunBatchOptions,
): Promise<BatchSummary> {
  const concurrency = Math.max(1, opts?.concurrency ?? 2);
  const attempts = Math.max(1, opts?.attempts ?? 5);
  const trace = opts?.trace ?? noopTraceSink;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) throw new Error(`job ${input.jobId} not found`);

  const [rubricRow] = await db
    .select()
    .from(rubrics)
    .where(eq(rubrics.jobId, input.jobId))
    .orderBy(desc(rubrics.version))
    .limit(1);
  if (!rubricRow) throw new Error(`no rubric for job ${input.jobId}`);

  const rows = await db
    .select({
      candidateId: candidates.id,
      documentId: documents.id,
      rawText: documents.rawText,
      sourceFileKey: candidates.sourceFileKey,
    })
    .from(candidates)
    .innerJoin(documents, eq(documents.candidateId, candidates.id))
    .where(
      opts?.candidateIds && opts.candidateIds.length > 0
        ? inArray(candidates.id, opts.candidateIds)
        : eq(candidates.jobId, input.jobId),
    );

  const [runRow] = await db
    .insert(scoringRuns)
    .values({
      jobId: input.jobId,
      rubricVersion: rubricRow.version,
      modelId: modelIdOf(model),
      promptHash: `batch:${rubricRow.id}`,
      seed: 0,
      status: "running",
    })
    .returning({ id: scoringRuns.id });
  const runRowId: string | undefined = runRow?.id;
  if (runRowId === undefined) throw new Error("scoring run insert returned no row");
  const runId: string = runRowId;

  const ctx: ScoreOneInvocation = {
    db,
    model,
    ...(opts?.runOptions === undefined ? {} : { runOptions: opts.runOptions }),
    actorId: opts?.actorId ?? input.actorId,
    trace,
  };

  trace.batchStarted({ jobId: input.jobId, orgId: input.orgId, runId, total: rows.length });
  const rubric: RunRubricShape = {
    id: rubricRow.id,
    version: rubricRow.version,
    payload: rubricRow.payload,
  };

  const results: BatchSummary["results"] = [];
  const failures: RunFailure[] = [];
  let cursor = 0;
  const overallScores: number[] = [];

  async function worker(): Promise<void> {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      if (!row) continue;
      try {
        const overall = await withRetry(
          () =>
            scoreOneCandidate(ctx, {
              runId,
              orgId: input.orgId,
              jobId: input.jobId,
              rubric,
              candidate: { id: row.candidateId, documentId: row.documentId, rawText: row.rawText },
            }),
          attempts,
        );
        overallScores.push(overall);
        results.push({ candidateId: row.candidateId, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ candidateId: row.candidateId, ok: false, error: message });
        // Persisted so the UI can name the failure and offer a retry —
        // a failed candidate must never silently vanish.
        failures.push({
          candidateId: row.candidateId,
          label: row.sourceFileKey?.split("/").pop() ?? null,
          error: message,
        });
      }
      const last = results[results.length - 1];
      if (opts?.onProgress && last) {
        opts.onProgress({
          completed: results.length,
          total: rows.length,
          candidateId: last.candidateId,
          ok: last.ok,
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, () => worker());
  await Promise.all(workers);

  const scored = results.filter((r) => r.ok).length;
  await db
    .update(scoringRuns)
    .set({ status: "completed", finishedAt: new Date(), failures })
    .where(eq(scoringRuns.id, runId));

  await appendAudit(db, {
    orgId: input.orgId,
    actorId: opts?.actorId ?? input.actorId,
    action: "scoring.batch.completed",
    payload: {
      runId,
      jobId: input.jobId,
      rubricVersion: rubricRow.version,
      total: rows.length,
      scored,
      failed: results.length - scored,
      failures: failures.map((f) => ({ candidateId: f.candidateId, error: f.error })),
    },
  });

  trace.batchCompleted({ runId, scored, failed: results.length - scored, total: rows.length });
  await trace.flush();

  return {
    runId,
    jobId: input.jobId,
    rubricVersion: rubricRow.version,
    total: rows.length,
    scored,
    failed: results.length - scored,
    results,
  };
}

interface RunRubricShape {
  id: string;
  version: number;
  payload: unknown;
}
