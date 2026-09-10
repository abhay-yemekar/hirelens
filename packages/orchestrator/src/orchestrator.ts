/**
 * Batch scoring orchestrator: fans a scoring run out across a job's
 * candidates with bounded concurrency, per-candidate retries, and full
 * persistence (scoring_runs, scores, evidence, audit_log). Designed to
 * be driven by any queue (Inngest in production, direct call in tests):
 * the unit of work is `scoreOneCandidate`, the entry point is `runBatch`.
 */

/** Summary of one batch scoring run. */
export interface BatchSummary {
  runId: string;
  jobId: string;
  rubricVersion: number;
  total: number;
  scored: number;
  failed: number;
  results: Array<{ candidateId: string; ok: boolean; error?: string }>;
}
