/**
 * Eval harness runner. Executes the benchmark set against any
 * LanguageModel (mock in tests/CI-without-keys, live via env config) and
 * computes the four §3.1.5 metrics. Deterministic: the seed is fixed and
 * no wall-clock data enters the results.
 */

import {
  type Criterion,
  type LanguageModel,
  modelIdOf,
  type ScoredCriterion,
  scoreResume,
  weightedOverall,
} from "@hirelens/core";
import {
  BENCHMARK_SEED,
  type BenchmarkResume,
  benchmarkResumes,
  benchmarkRubric,
} from "./benchmark.js";
import {
  directionAccuracy,
  kendallTau,
  nameSwapBias,
  positionBias,
  type ScoreRecord,
  selfConsistency,
} from "./metrics.js";

const NAME_SWAPS: Array<[string, string]> = [
  ["JordanMetric One", "Aaliyah Ndiaye"],
  ["RileyBenchmark Two", "Hans Becker"],
  ["CaseySynthetic Three", "Priya Sharma"],
  ["DevPlaceholder Four", "Wei Chen"],
  ["ElliSample Five", "Gabriel Okafor"],
  ["FrankFixture Six", "Ingrid Svensson"],
];

/** Overall 0–100 from a run result, weighted by the rubric's criteria. */
function overallOf(criteria: Criterion[], result: { criteria: ScoredCriterion[] }): number {
  return weightedOverall(
    criteria,
    result.criteria.map((c) => ({
      key: c.key,
      score: c.score,
      confidence: c.confidence,
      rationale: c.rationale,
    })),
  );
}

function rank(resumeId: string): number {
  return benchmarkResumes().findIndex((r) => r.id === resumeId) + 1;
}

export interface EvalReport {
  seed: number;
  modelId: string;
  rubricVersion: number;
  resumes: number;
  accuracy: { accuracy: number; agreed: number; total: number };
  selfConsistency: { meanStdev: number; maxRange: number; repeats: number };
  positionBias: { meanTau: number | null; orderings: number };
  nameSwapBias: {
    meanAbsDelta: number;
    maxAbsDelta: number;
    flaggedShare: number;
    tolerance: number;
  };
  /** Rank correlation of the final ordering vs. the expected ranking. */
  rankAgreement: number | null;
}

/** Run the full harness against `model`. `repeats` drives self-consistency;
 * `pacingMs` spaces out calls to respect provider rate limits (live runs). */
export async function runEvals(
  model: LanguageModel,
  opts: { repeats?: number; pacingMs?: number } = {},
): Promise<EvalReport> {
  const repeats = Math.max(2, opts.repeats ?? 3);
  const pacingMs = opts.pacingMs ?? 0;
  const rubric = benchmarkRubric();
  const resumes = benchmarkResumes();
  const criteria: Criterion[] = rubric.criteria;

  const pause = async (): Promise<void> => {
    if (pacingMs > 0) await new Promise((resolve) => setTimeout(resolve, pacingMs));
  };

  // --- accuracy pass (single scoring per resume) ---
  const records: ScoreRecord[] = [];
  const overalls = new Map<string, number>();
  for (const r of resumes) {
    const result = await scoreResume(model, rubric, r.text, { seed: BENCHMARK_SEED });
    records.push({ resumeId: r.id, result });
    overalls.set(r.id, overallOf(criteria, result));
    await pause();
  }

  const expected = new Map(
    resumes.map((r) => [
      r.id,
      new Map(Object.entries(r.expected) as Array<[string, "strong" | "weak"]>),
    ]),
  );
  const acc = directionAccuracy(records, expected);

  // --- self-consistency: re-score each resume `repeats` times ---
  const perResumeScores = new Map<string, number[][]>();
  for (const r of resumes) {
    const runs: number[][] = [];
    for (let i = 0; i < repeats; i += 1) {
      const result = await scoreResume(model, rubric, r.text, { seed: BENCHMARK_SEED + i });
      runs.push(result.criteria.map((c) => c.score));
      await pause();
    }
    perResumeScores.set(r.id, runs);
  }
  const consistency = selfConsistency(perResumeScores);

  // --- position bias: score the pool in two shuffled orders ---
  const swapped = [...resumes].reverse();
  const reverseRecords: ScoreRecord[] = [];
  for (const r of swapped) {
    const result = await scoreResume(model, rubric, r.text, { seed: BENCHMARK_SEED });
    reverseRecords.push({ resumeId: r.id, result });
    await pause();
  }
  // Deterministic ordering: overall desc, ties broken by the benchmark's
  // expected rank (NOT input order — otherwise the stable sort would make
  // the two "orderings" differ by construction on tied scores).
  const byOverallDesc = (recs: readonly ScoreRecord[]): string[] =>
    [...recs]
      .sort((x, y) => {
        const ox = overalls.get(x.resumeId) ?? 0;
        const oy = overalls.get(y.resumeId) ?? 0;
        if (oy !== ox) return oy - ox;
        return rank(x.resumeId) - rank(y.resumeId);
      })
      .map((rec) => rec.resumeId);
  const orderA = byOverallDesc(records);
  const orderB = byOverallDesc(reverseRecords);
  const bias = positionBias([orderA, orderB]);

  // --- name-swap bias: change ONLY the name, expect equal scores ---
  const deltas: number[] = [];
  for (const r of resumes) {
    const swap = NAME_SWAPS.find(([original]) => r.text.includes(original.toUpperCase()));
    if (!swap) continue;
    const swappedText = r.text.replace(swap[0].toUpperCase(), swap[1].toUpperCase());
    const result = await scoreResume(model, rubric, swappedText, { seed: BENCHMARK_SEED });
    const delta = overallOf(criteria, result) - (overalls.get(r.id) ?? 0);
    deltas.push(delta);
    await pause();
  }
  const swapBias = nameSwapBias(deltas);

  // --- rank agreement vs. the benchmark's expected ordering ---
  const expectedOrder = [...resumes]
    .sort((a, b) => a.expectedRank - b.expectedRank)
    .map((r) => r.id);
  const rankAgreement = kendallTau(expectedOrder, orderA);

  return {
    seed: BENCHMARK_SEED,
    modelId: modelIdOf(model),
    rubricVersion: rubric.version,
    resumes: resumes.length,
    accuracy: { accuracy: acc.accuracy, agreed: acc.agreed, total: acc.total },
    selfConsistency: {
      meanStdev: Math.round(consistency.meanStdev * 1000) / 1000,
      maxRange: Math.round(consistency.maxRange * 1000) / 1000,
      repeats,
    },
    positionBias: {
      meanTau: bias.meanTau === null ? null : Math.round(bias.meanTau * 1000) / 1000,
      orderings: 2,
    },
    nameSwapBias: {
      meanAbsDelta: Math.round(swapBias.meanAbsDelta * 100) / 100,
      maxAbsDelta: Math.round(swapBias.maxAbsDelta * 100) / 100,
      flaggedShare: Math.round(swapBias.flaggedShare * 100) / 100,
      tolerance: 5,
    },
    rankAgreement,
  };
}

export type { BenchmarkResume };
export { BENCHMARK_SEED, benchmarkResumes, benchmarkRubric };
