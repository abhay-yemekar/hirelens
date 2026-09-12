/**
 * Langfuse-backed TraceSink. Maps the orchestrator's neutral trace events
 * onto Langfuse traces/generations. Constructed once per batch; a no-op
 * when Langfuse env vars are absent (see observability.ts).
 */

import type { GenerationObservation, TraceSink } from "@hirelens/orchestrator";
import { logger, startTrace, type TraceHandle } from "./observability.js";

export function langfuseTraceSink(): TraceSink {
  let handle: TraceHandle | null = startTrace("scoring.batch");

  if (!handle) {
    // Langfuse not configured — behave as the no-op sink.
    return {
      batchStarted: () => {},
      generation: () => {},
      batchCompleted: () => {},
      flush: async () => {},
    };
  }

  return {
    batchStarted(meta) {
      handle?.trace.update({
        metadata: {
          jobId: meta.jobId,
          orgId: meta.orgId,
          runId: meta.runId,
          total: meta.total,
        },
      });
    },
    generation(obs: GenerationObservation) {
      const generation = handle?.trace.generation({
        name: "score-resume",
        model: obs.modelId,
        metadata: {
          candidateId: obs.candidateId,
          jobId: obs.jobId,
          runId: obs.runId,
          rubricVersion: obs.rubricVersion,
          promptHash: obs.promptHash,
          repaired: obs.repaired,
          latencyMs: obs.latencyMs,
          ...(obs.error ? { error: obs.error } : {}),
        },
        usage: {
          ...(obs.usage?.inputTokens === undefined ? {} : { input: obs.usage.inputTokens }),
          ...(obs.usage?.outputTokens === undefined ? {} : { output: obs.usage.outputTokens }),
          ...(obs.usage?.totalTokens === undefined ? {} : { total: obs.usage.totalTokens }),
          unit: "TOKENS" as const,
        },
      });
      // Score-level detail rides on the generation's output metadata.
      generation?.update({
        metadata: {
          scores: obs.scores,
        },
      });
      generation?.end();
      if (obs.error) {
        logger.warn(
          { candidateId: obs.candidateId, error: obs.error },
          "scoring.generation.failed",
        );
      } else {
        logger.info(
          {
            candidateId: obs.candidateId,
            runId: obs.runId,
            latencyMs: obs.latencyMs,
            totalTokens: obs.usage?.totalTokens,
          },
          "scoring.generation.completed",
        );
      }
    },
    batchCompleted(meta) {
      logger.info(
        { runId: meta.runId, scored: meta.scored, failed: meta.failed, total: meta.total },
        "scoring.batch.completed",
      );
      handle?.trace.update({ metadata: { ...meta, status: "completed" } });
      const h = handle;
      handle = null;
      void h?.end().catch((err) => logger.error({ err }, "langfuse.shutdown.failed"));
    },
    async flush() {
      const h = handle;
      handle = null;
      if (h) await h.end().catch((err) => logger.error({ err }, "langfuse.flush.failed"));
    },
  };
}
