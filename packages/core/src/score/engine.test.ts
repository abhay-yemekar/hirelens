import { describe, expect, it } from "vitest";
import { createMockModel, type LanguageModel } from "../llm/index.js";
import type { AnchoredLevel, Rubric } from "../rubric/schema.js";
import { MAX_RESUME_CHARS, scoreResume } from "./engine.js";
import { percentileRank, poolMean } from "./pool.js";

const RESUME = `JORDAN AVERY
Senior Backend Engineer - jordan@example.com

EXPERIENCE
Senior Backend Engineer - Acme Corp - 2021 - Present
- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.
- Built event-driven services in TypeScript handling 40k req/s.
`;

function makeRubric(): Rubric {
  const levels: [
    AnchoredLevel,
    AnchoredLevel,
    AnchoredLevel,
    AnchoredLevel,
    AnchoredLevel,
    AnchoredLevel,
  ] = [
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
  return {
    version: 1,
    key: "backend-eng",
    title: "Backend Engineer",
    criteria: [
      criterion("system-design", 3),
      criterion("databases", 1),
      criterion("testing", 1),
      criterion("ops", 1),
      criterion("communication", 1),
    ],
    exclusions: [],
  };
}

function mockScores(overrides: Record<string, Partial<Record<string, unknown>>> = {}) {
  const base = [
    {
      key: "system-design",
      score: 4,
      confidence: 0.9,
      rationale: "Strong: led payments platform migration.",
      quote: "Led migration of the payments platform to Kubernetes",
    },
    { key: "databases", score: 3, confidence: 0.8, rationale: "Solid.", quote: "" },
    { key: "testing", score: 2, confidence: 0.7, rationale: "Basic.", quote: "" },
    { key: "ops", score: 4, confidence: 0.85, rationale: "Strong.", quote: "40k req/s" },
    { key: "communication", score: 3, confidence: 0.75, rationale: "Solid.", quote: "" },
  ];
  return {
    criteria: base.map((c) => ({ ...c, ...(overrides[c.key] ?? {}) })),
  };
}

describe("scoreResume", () => {
  it("scores all criteria with located evidence spans", async () => {
    const { model } = createMockModel({ args: mockScores() });
    const rubric = makeRubric();
    const res = await scoreResume(model as LanguageModel, rubric, RESUME);
    expect(res.criteria).toHaveLength(5);
    const sd = res.criteria.find((c) => c.key === "system-design");
    expect(sd?.evidence).not.toBeNull();
    expect(sd?.evidence?.quotedText).toContain("Kubernetes");
    expect(res.criteria.find((c) => c.key === "databases")?.evidence).toBeNull();
    expect(res.overall).toBeGreaterThan(0);
    expect(res.overall).toBeLessThanOrEqual(100);
    expect(res.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.needsAdjudication).toBe(false);
  });

  it("is deterministic for identical inputs (same prompt hash, same overall)", async () => {
    const rubric = makeRubric();
    const a = await scoreResume(
      createMockModel({ args: mockScores() }).model as LanguageModel,
      rubric,
      RESUME,
    );
    const b = await scoreResume(
      createMockModel({ args: mockScores() }).model as LanguageModel,
      rubric,
      RESUME,
    );
    expect(a.promptHash).toBe(b.promptHash);
    expect(a.overall).toBe(b.overall);
  });

  it("flags adjudication when many criteria have low confidence", async () => {
    const low = mockScores({
      "system-design": { confidence: 0.2 },
      databases: { confidence: 0.2 },
      testing: { confidence: 0.2 },
    });
    const { model } = createMockModel({ args: low });
    const res = await scoreResume(model as LanguageModel, makeRubric(), RESUME);
    expect(res.needsAdjudication).toBe(true);
  });

  it("fills missing criteria with zero instead of skipping", async () => {
    const partial = mockScores();
    partial.criteria = partial.criteria.slice(0, 3);
    const { model } = createMockModel({ args: partial });
    const res = await scoreResume(model as LanguageModel, makeRubric(), RESUME);
    expect(res.criteria).toHaveLength(5);
    const missing = res.criteria.find((c) => c.key === "ops");
    expect(missing?.score).toBe(0);
    expect(missing?.rationale).toContain("No score returned");
  });

  it("yields null evidence for fabricated quotes", async () => {
    const fabricated = mockScores({ ops: { quote: "This sentence is nowhere in the resume" } });
    const { model } = createMockModel({ args: fabricated });
    const res = await scoreResume(model as LanguageModel, makeRubric(), RESUME);
    expect(res.criteria.find((c) => c.key === "ops")?.evidence).toBeNull();
  });

  it("truncates oversized resumes deterministically", async () => {
    const { model, calls } = createMockModel({ args: mockScores() });
    await scoreResume(model as LanguageModel, makeRubric(), "x".repeat(MAX_RESUME_CHARS + 9000));
    expect(calls[0]?.prompt.length).toBeLessThan(MAX_RESUME_CHARS + 9000);
    expect(calls[0]?.prompt).toContain("…");
  });

  it("rejects out-of-range scores through the schema gate", async () => {
    const bad = mockScores({ "system-design": { score: 9 } });
    const { model } = createMockModel({ args: bad });
    await expect(scoreResume(model as LanguageModel, makeRubric(), RESUME)).rejects.toThrow(
      /violated/,
    );
  });
});

describe("percentileRank", () => {
  it("ranks strictly by position with mid-rank ties", () => {
    expect(percentileRank([10, 20, 30, 40], 35)).toBe(75);
    expect(percentileRank([10, 20, 30, 40], 30)).toBe(63);
    expect(percentileRank([10, 20], 5)).toBe(0);
    expect(percentileRank([10, 20], 25)).toBe(100);
  });

  it("handles empty pools and single candidates", () => {
    expect(percentileRank([], 50)).toBe(0);
    expect(percentileRank([50], 50)).toBe(50);
  });
});

describe("poolMean", () => {
  it("computes a one-decimal mean", () => {
    expect(poolMean([10, 20, 30])).toBe(20);
    expect(poolMean([1, 2])).toBe(1.5);
    expect(poolMean([])).toBe(0);
  });
});
