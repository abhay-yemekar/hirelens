/**
 * Vendor-neutral tracing hooks. The orchestrator records what happened;
 * the transport (Langfuse, in apps/api) decides where it goes. Keeping
 * the interface here means packages/core stays vendor-free and tests run
 * with the no-op tracer.
 */

export interface GenerationObservation {
  candidateId: string;
  jobId: string;
  runId: string;
  rubricVersion: number;
  modelId: string;
  promptHash: string;
  /** Criterion scores returned by the model (pre-persistence). */
  scores: Array<{ key: string; score: number; confidence: number | null }>;
  repaired: boolean;
  usage:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
  latencyMs: number;
  error?: string;
}

export interface TraceSink {
  /** A scoring batch started. */
  batchStarted(meta: { jobId: string; orgId: string; runId: string; total: number }): void;
  /** One candidate scored (or failed). */
  generation(observation: GenerationObservation): void;
  /** The batch finished. */
  batchCompleted(meta: { runId: string; scored: number; failed: number; total: number }): void;
  /** Flush any buffered telemetry. */
  flush(): Promise<void>;
}

/** Default no-op sink: zero-cost when observability is not configured. */
export const noopTraceSink: TraceSink = {
  batchStarted: () => {},
  generation: () => {},
  batchCompleted: () => {},
  flush: async () => {},
};
