import { describe, expect, it } from "vitest";
import type { Criterion } from "../rubric/schema.js";
import { type CriterionScore, weightedOverall } from "./weighting.js";

function crit(key: string, weight: number): Criterion {
  return {
    key,
    title: key,
    weight,
    scale: [
      { label: "0", description: "none" },
      { label: "1", description: "minimal" },
      { label: "2", description: "basic" },
      { label: "3", description: "solid" },
      { label: "4", description: "strong" },
      { label: "5", description: "expert" },
    ],
    doNotUse: [],
  };
}

const criteria = [crit("a", 0.6), crit("b", 0.4)];

describe("weightedOverall", () => {
  it("computes the weighted mean scaled to 0-100", () => {
    const scores: CriterionScore[] = [
      { key: "a", score: 5, confidence: 0.9, rationale: "r" },
      { key: "b", score: 2, confidence: 0.8, rationale: "r" },
    ];
    // 0.6*5 + 0.4*2 = 3.8 -> 76
    expect(weightedOverall(criteria, scores)).toBe(76);
  });

  it("ignores scores for unknown criteria keys", () => {
    const scores: CriterionScore[] = [{ key: "zzz", score: 5, confidence: 1, rationale: "r" }];
    expect(weightedOverall(criteria, scores)).toBe(0);
  });

  withZeroWeightsIt();
});

// Separate case: all weights zero must not divide by zero.
function withZeroWeightsIt(): void {
  it("returns 0 when no weights apply", () => {
    expect(weightedOverall([], [{ key: "a", score: 5, confidence: 1, rationale: "r" }])).toBe(0);
  });
}
