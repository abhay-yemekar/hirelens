import type { Criterion } from "../rubric/schema.js";

/** Per-criterion score produced by the scorer. */
export interface CriterionScore {
  key: string;
  score: number;
  confidence: number;
  rationale: string;
}

/**
 * Aggregate per-criterion scores into a normalized 0-100 overall score.
 * Weights are sum-normalized, so raw weights need not sum to 1.
 * Unknown criterion keys are ignored.
 */
export function weightedOverall(
  criteria: readonly Criterion[],
  scores: readonly CriterionScore[],
): number {
  const byKey = new Map(scores.map((s) => [s.key, s]));
  let sum = 0;
  let weightSum = 0;
  for (const c of criteria) {
    const s = byKey.get(c.key);
    if (!s) continue;
    sum += c.weight * s.score;
    weightSum += c.weight;
  }
  if (weightSum === 0) return 0;
  return Math.round((sum / weightSum) * 20);
}
