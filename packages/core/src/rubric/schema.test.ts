import { describe, expect, it } from "vitest";
import { normalizeWeights, type Rubric, RubricSchema } from "./schema.js";

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
  const levels = [
    { label: "0", description: "none" },
    { label: "1", description: "minimal" },
    { label: "2", description: "basic" },
    { label: "3", description: "solid" },
    { label: "4", description: "strong" },
    { label: "5", description: "expert" },
  ];
  const criterion = (key: string, weight: number) => ({
    key,
    title: key,
    weight,
    scale: levels,
    doNotUse: [],
  });
  return RubricSchema.parse({
    version: 1,
    key: "test",
    title: "Test Rubric",
    criteria: [
      criterion("a", 3),
      criterion("b", 1),
      criterion("c", 1),
      criterion("d", 1),
      criterion("e", 1),
    ],
    ...overrides,
  });
}

describe("RubricSchema", () => {
  it("accepts a valid 5-criterion rubric", () => {
    expect(() => makeRubric()).not.toThrow();
  });

  it("rejects fewer than 5 criteria", () => {
    const r = makeRubric();
    expect(() => RubricSchema.parse({ ...r, criteria: r.criteria.slice(0, 4) })).toThrow();
  });

  it("rejects more than 8 criteria", () => {
    const r = makeRubric();
    const first = r.criteria[0];
    const extra = { ...first, key: "extra" };
    expect(() =>
      RubricSchema.parse({
        ...r,
        criteria: [...r.criteria, extra, extra, extra, extra],
      }),
    ).toThrow();
  });
});

describe("normalizeWeights", () => {
  it("sum-normalizes weights to 1", () => {
    const r = makeRubric();
    const w = normalizeWeights(r.criteria);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
    expect(w[0]).toBeCloseTo(3 / 7); // 3 of 7 total
  });

  it("distributes evenly when all weights are zero", () => {
    const r = makeRubric();
    const zeroed = r.criteria.map((c) => ({ ...c, weight: 0 }));
    const w = normalizeWeights(zeroed);
    expect(w.every((x) => Math.abs(x - 0.2) < 1e-9)).toBe(true);
  });
});
