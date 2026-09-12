/**
 * Orchestrator part 2: the per-candidate unit of work and the batch
 * fan-out. Split from orchestrator.ts to keep files small.
 */

import { type LanguageModel, modelIdOf, type ScoreRunOptions, scoreResume } from "@hirelens/core";
import { type Database, evidence, scores } from "@hirelens/db";
import { appendAudit } from "./audit.js";
import type { TraceSink } from "./trace.js";

/** Shared knobs for batch + single-candidate scoring. */
export interface ScoreOneContext {
  runOptions?: ScoreRunOptions;
  actorId?: string | undefined;
  /** Telemetry sink; omit (or pass noopTraceSink) to disable tracing. */
  trace?: TraceSink | undefined;
}

/** Everything scoreOneCandidate needs, as assembled by runBatch. */
export interface ScoreOneInvocation extends ScoreOneContext {
  db: Database;
  model: LanguageModel;
  runId?: string | undefined;
  jobId?: string | undefined;
  orgId?: string | undefined;
  rubricVersion?: number | undefined;
}

export interface RunRubricRow {
  id: string;
  version: number;
  payload: unknown;
}

/**
 * Score one candidate within an existing run: call the engine, persist
 * score + evidence rows, and audit the per-candidate completion.
 * Returns the engine's overall score for pool statistics.
 */
export async function scoreOneCandidate(
  ctx: ScoreOneInvocation,
  params: {
    runId: string;
    orgId: string;
    jobId: string;
    rubric: RunRubricRow;
    candidate: { id: string; documentId: string; rawText: string };
  },
): Promise<number> {
  const { candidate, rubric } = params;
  const startedAt = Date.now();
  let engineResult: Awaited<ReturnType<typeof scoreResume>>;
  try {
    engineResult = await scoreResume(
      ctx.model,
      rubric.payload as Parameters<typeof scoreResume>[1],
      candidate.rawText,
      ctx.runOptions,
    );
  } catch (err) {
    ctx.trace?.generation({
      candidateId: candidate.id,
      jobId: params.jobId,
      runId: params.runId,
      rubricVersion: rubric.version,
      modelId: modelIdOf(ctx.model),
      promptHash: "",
      scores: [],
      repaired: false,
      usage: undefined,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  ctx.trace?.generation({
    candidateId: candidate.id,
    jobId: params.jobId,
    runId: params.runId,
    rubricVersion: rubric.version,
    modelId: engineResult.modelId,
    promptHash: engineResult.promptHash,
    scores: engineResult.criteria.map((c) => ({
      key: c.key,
      score: c.score,
      confidence: c.confidence,
    })),
    repaired: engineResult.repaired,
    usage: engineResult.usage,
    latencyMs: Date.now() - startedAt,
  });

  for (const c of engineResult.criteria) {
    const [scoreRow] = await ctx.db
      .insert(scores)
      .values({
        runId: params.runId,
        candidateId: candidate.id,
        criterionKey: c.key,
        score: c.score,
        confidence: c.confidence,
        rationale: c.rationale,
      })
      .returning({ id: scores.id });
    if (!scoreRow) throw new Error("score insert returned no row");

    if (c.evidence) {
      await ctx.db.insert(evidence).values({
        scoreId: scoreRow.id,
        documentId: candidate.documentId,
        startOffset: c.evidence.startOffset,
        endOffset: c.evidence.endOffset,
        quotedText: c.evidence.quotedText,
      });
    }
  }

  await appendAudit(ctx.db, {
    orgId: params.orgId,
    actorId: ctx.actorId,
    action: "scoring.candidate.completed",
    payload: {
      runId: params.runId,
      jobId: params.jobId,
      candidateId: candidate.id,
      rubricVersion: rubric.version,
      overall: engineResult.overall,
      promptHash: engineResult.promptHash,
      modelId: engineResult.modelId,
      needsAdjudication: engineResult.needsAdjudication,
    },
  });

  return engineResult.overall;
}
