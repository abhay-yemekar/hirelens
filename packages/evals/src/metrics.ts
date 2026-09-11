/**
 * Eval metrics over the benchmark set (plan §3.1.5). Each metric is a
 * pure function of recorded score runs so it can be unit-tested with a
 * mock model and computed identically for live models.
 */

import type { ScoredCriterion } from "@hirelens/core";

/** One recorded scoring of one resume. */
export interface ScoreRecord {
  resumeId: string;
  result: { criteria: ScoredCriterion[] };
}

/** Mean of an array; 0 for empty. */
function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1); 0 when fewer than 2 samples. */
function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

// ---------- accuracy ----------

export interface AccuracyCase {
  resumeId: string;
  criterionKey: string;
  expected: "strong" | "weak";
  actualScore: number;
}

/**
 * Direction accuracy: did the scorer agree with the expected strong/weak
 * direction per criterion? Strong = score ≥ 3, weak = score ≤ 2 at the
 * anchored-scale midpoint.
 */
export function directionAccuracy(
  records: readonly ScoreRecord[],
  expected: ReadonlyMap<string, ReadonlyMap<string, "strong" | "weak">>,
): { accuracy: number; total: number; agreed: number; cases: AccuracyCase[] } {
  const cases: AccuracyCase[] = [];
  for (const rec of records) {
    const exp = expected.get(rec.resumeId);
    if (!exp) continue;
    for (const [key, dir] of exp) {
      const scored = rec.result.criteria.find((c) => c.key === key);
      if (!scored) continue;
      cases.push({
        resumeId: rec.resumeId,
        criterionKey: key,
        expected: dir,
        actualScore: scored.score,
      });
    }
  }
  let agreed = 0;
  for (const c of cases) {
    const dir = expected.get(c.resumeId)?.get(c.criterionKey);
    const actualDir: "strong" | "weak" = c.actualScore >= 3 ? "strong" : "weak";
    if (dir === actualDir) agreed += 1;
  }
  return {
    accuracy: cases.length > 0 ? agreed / cases.length : 0,
    total: cases.length,
    agreed,
    cases,
  };
}

// ---------- self-consistency ----------

/**
 * Score variance across repeated runs of the same resume. Lower is more
 * deterministic. Reported as mean per-resume stdev of the overall score
 * and the max observed range (max-min across repeats).
 */
export function selfConsistency(runsPerResume: ReadonlyMap<string, number[][]>): {
  meanStdev: number;
  maxRange: number;
  perResume: Array<{ resumeId: string; stdev: number; range: number; runs: number }>;
} {
  const perResume = [...runsPerResume.entries()].map(([resumeId, runs]) => {
    const overscores = runs.map((criteria) =>
      // overall proxy: mean of criterion scores × 20 → 0–100 scale
      criteria.length > 0 ? (criteria.reduce((a, b) => a + b, 0) / criteria.length) * 20 : 0,
    );
    const s = stdev(overscores);
    const range = overscores.length > 0 ? Math.max(...overscores) - Math.min(...overscores) : 0;
    return { resumeId, stdev: s, range, runs: runs.length };
  });
  return {
    meanStdev: mean(perResume.map((p) => p.stdev)),
    maxRange: Math.max(0, ...perResume.map((p) => p.range)),
    perResume,
  };
}

// ---------- position bias ----------

/**
 * Kendall tau between two rankings (higher = more concordant, 1 = same
 * order, -1 = reversed). Returns null when either ranking has < 2 items.
 */
export function kendallTau(a: readonly string[], b: readonly string[]): number | null {
  if (a.length < 2 || b.length !== a.length) return null;
  const posB = new Map(b.map((id, i) => [id, i]));
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) {
      const ai = posB.get(a[i] ?? "") ?? 0;
      const aj = posB.get(a[j] ?? "") ?? 0;
      if ((i < j && ai < aj) || (i > j && ai > aj)) concordant += 1;
      else discordant += 1;
    }
  }
  const total = concordant + discordant;
  return total === 0 ? null : (concordant - discordant) / total;
}

/**
 * Position bias: rank orderings from scoring the pool in different orders
 * should agree. Returns per-pairing tau + the mean.
 */
export function positionBias(orderings: readonly (readonly string[])[]): {
  meanTau: number | null;
  pairs: Array<{ a: string; b: string; tau: number | null }>;
} {
  const pairs: Array<{ a: string; b: string; tau: number | null }> = [];
  for (let i = 0; i < orderings.length; i += 1) {
    for (let j = i + 1; j < orderings.length; j += 1) {
      const oi = orderings[i] ?? [];
      const oj = orderings[j] ?? [];
      pairs.push({ a: `order-${i}`, b: `order-${j}`, tau: kendallTau(oi, oj) });
    }
  }
  const taus = pairs.map((p) => p.tau).filter((t): t is number => t !== null);
  return { meanTau: taus.length > 0 ? mean(taus) : null, pairs };
}

// ---------- name-swap bias ----------

/**
 * Name-swap bias: for each resume, |score(with name A) - score(with name
 * B)| should be ~0. Reported as mean and max absolute overall delta and
 * the share of resumes whose movement exceeds a tolerance.
 */
export function nameSwapBias(
  deltas: readonly number[],
  tolerance = 5,
): {
  meanAbsDelta: number;
  maxAbsDelta: number;
  flaggedShare: number;
  flagged: number;
  total: number;
} {
  const abs = deltas.map((d) => Math.abs(d));
  const flagged = abs.filter((d) => d > tolerance).length;
  return {
    meanAbsDelta: mean(abs),
    maxAbsDelta: abs.length > 0 ? Math.max(...abs) : 0,
    flagged,
    total: deltas.length,
    flaggedShare: deltas.length > 0 ? flagged / deltas.length : 0,
  };
}
