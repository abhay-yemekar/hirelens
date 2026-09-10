/**
 * runBatch: creates the scoring_runs row, fans out per-candidate work
 * with bounded concurrency and retries, and closes the run. Failures
 * are recorded per candidate and never abort the whole batch.
 */

import { type LanguageModel, modelIdOf } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { candidates, documents, jobs, rubrics, scoringRuns } from "@hirelens/db";
import { desc, eq } from "drizzle-orm";
import { appendAudit } from "./audit.js";
import type { BatchSummary } from "./orchestrator.js";
import { type ScoreOneContext, scoreOneCandidate } from "./run.js";

export interface RunBatchOptions extends ScoreOneContext {
  /** Max candidates scored concurrently. Default 4. */
  concurrency?: number;
  /** Retry attempts per candidate. Default 3. */
  attempts?: number;
  /**
   * Progress callback, invoked after each candidate settles. Transport-
   * agnostic: the API layer can bridge this to SSE for live progress.
   */
  onProgress?:
    | ((p: { completed: number; total: number; candidateId: string; ok: boolean }) => void)
    | undefined;
}

/** Score every candidate on a job against the job's latest rubric version. */
export async function runBatch(
  db: Database,
  model: LanguageModel,
  input: { jobId: string; orgId: string; actorId?: string | undefined },
  opts?: RunBatchOptions,
): Promise<BatchSummary> {
  const concurrency = Math.max(1, opts?.concurrency ?? 4);
  const attempts = Math.max(1, opts?.attempts ?? 3);

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
    })
    .from(candidates)
    .innerJoin(documents, eq(documents.candidateId, candidates.id))
    .where(eq(candidates.jobId, input.jobId));

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

  const ctx: ScoreOneContext = {
    db,
    model,
    ...(opts?.runOptions === undefined ? {} : { runOptions: opts.runOptions }),
    actorId: opts?.actorId ?? input.actorId,
  };
  const rubric: RunRubricShape = {
    id: rubricRow.id,
    version: rubricRow.version,
    payload: rubricRow.payload,
  };

  const results: BatchSummary["results"] = [];
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
        results.push({
          candidateId: row.candidateId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
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
    .set({ status: "completed", finishedAt: new Date() })
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
    },
  });

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

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 50 * 2 ** (i - 1)));
    }
  }
  throw lastError;
}
