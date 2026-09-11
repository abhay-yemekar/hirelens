import { createMockModel } from "@hirelens/core";
import { describe, expect, it } from "vitest";
import { benchmarkResumes, benchmarkRubric } from "./benchmark.js";
import { runEvals } from "./harness.js";
import { kendallTau, nameSwapBias, positionBias } from "./metrics.js";

describe("benchmark set", () => {
  it("is well-formed: unique ids, all criteria covered, ranks 1..n", () => {
    const resumes = benchmarkResumes();
    const rubric = benchmarkRubric();
    const ids = new Set(resumes.map((r) => r.id));
    expect(ids.size).toBe(resumes.length);
    for (const r of resumes) {
      expect(Object.keys(r.expected).sort()).toEqual([...rubric.criteria.map((c) => c.key)].sort());
      expect(r.expectedRank).toBeGreaterThan(0);
      expect(r.expectedRank).toBeLessThanOrEqual(resumes.length);
      expect(r.text).toContain(r.name.toUpperCase());
    }
    expect(
      [...resumes].sort((a, b) => a.expectedRank - b.expectedRank).map((r) => r.expectedRank),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("metric helpers", () => {
  it("kendallTau: 1 for identical, -1 for reversed, null for mismatched lengths", () => {
    expect(kendallTau(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    expect(kendallTau(["a", "b", "c"], ["c", "b", "a"])).toBe(-1);
    expect(kendallTau(["a"], ["a", "b"])).toBeNull();
  });

  it("positionBias aggregates pair taus", () => {
    const res = positionBias([
      ["a", "b", "c"],
      ["a", "b", "c"],
      ["c", "b", "a"],
    ]);
    expect(res.pairs).toHaveLength(3);
    expect(res.meanTau).toBeCloseTo((1 + -1 + -1) / 3, 5);
  });

  it("nameSwapBias flags movements above tolerance", () => {
    const res = nameSwapBias([0, 1, 12], 5);
    expect(res.flagged).toBe(1);
    expect(res.flaggedShare).toBeCloseTo(1 / 3, 5);
    expect(res.maxAbsDelta).toBe(12);
  });
});

describe("runEvals (mock model)", () => {
  it("runs end-to-end and produces a coherent report", async () => {
    const { model } = createMockModel({
      args: {
        criteria: ["system-design", "databases", "testing", "ops", "communication"].map((key) => ({
          key,
          score: 3,
          confidence: 0.9,
          rationale: "benchmark",
          quote: "",
        })),
      },
    });

    const report = await runEvals(model, { repeats: 3 });

    expect(report.resumes).toBe(6);
    expect(report.modelId).toBe("mock-1");
    // Constant mock: every criterion 3 → all directions "strong" → agrees
    // with the 14 expected-strong cases of 30 total (6 resumes × 5 criteria).
    expect(report.accuracy.total).toBe(30);
    expect(report.accuracy.agreed).toBe(14);
    // Constant output → zero variance, zero position/name-swap movement.
    expect(report.selfConsistency.meanStdev).toBe(0);
    expect(report.selfConsistency.maxRange).toBe(0);
    expect(report.positionBias.meanTau).toBe(1);
    expect(report.nameSwapBias.meanAbsDelta).toBe(0);
    expect(report.nameSwapBias.flaggedShare).toBe(0);
  });
});
