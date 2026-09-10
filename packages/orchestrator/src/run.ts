/**
 * Orchestrator part 2: the per-candidate unit of work and the batch
 * fan-out. Split from orchestrator.ts to keep files small.
 */

import type { ScoreRunOptions } from "@hirelens/core";
import { type LanguageModel, scoreResume } from "@hirelens/core";
import { type Database, evidence, scores } from "@hirelens/db";
import { appendAudit } from "./audit.js";

export interface ScoreOneContext {
  db: Database;
  model: LanguageModel;
  runOptions?: ScoreRunOptions;
  actorId?: string | undefined;
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
  ctx: ScoreOneContext,
  params: {
    runId: string;
    orgId: string;
    jobId: string;
    rubric: RunRubricRow;
    candidate: { id: string; documentId: string; rawText: string };
  },
): Promise<number> {
  const { candidate, rubric } = params;
  const engineResult = await scoreResume(
    ctx.model,
    rubric.payload as Parameters<typeof scoreResume>[1],
    candidate.rawText,
    ctx.runOptions,
  );

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
