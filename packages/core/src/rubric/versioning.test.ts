import { describe, expect, it } from "vitest";
import type { AnchoredLevel, Rubric } from "./schema.js";
import { diffRubrics, forkRubric, parseRubric, serializeRubric } from "./versioning.js";

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
      criterion("a", 3),
      criterion("b", 1),
      criterion("c", 1),
      criterion("d", 1),
      criterion("e", 1),
    ],
    exclusions: [],
  };
}

describe("forkRubric", () => {
  it("bumps the version and deep-clones", () => {
    const r = makeRubric();
    const fork = forkRubric(r);
    expect(fork.version).toBe(2);
    expect(fork).not.toBe(r);
    expect(fork.criteria[0]).not.toBe(r.criteria[0]);
    expect(fork.criteria).toEqual(r.criteria);
  });

  it("supports rekeying and retitling", () => {
    const fork = forkRubric(makeRubric(), { key: "platform-eng", title: "Platform Engineer" });
    expect(fork.key).toBe("platform-eng");
    expect(fork.title).toBe("Platform Engineer");
    expect(fork.version).toBe(2);
  });
});

describe("serializeRubric / parseRubric", () => {
  it("round-trips through canonical JSON", () => {
    const r = makeRubric();
    const json = serializeRubric(r);
    expect(parseRubric(json)).toEqual(r);
  });

  it("produces stable output independent of key insertion order", () => {
    const r = makeRubric();
    const reordered = {
      ...structuredClone(r),
      exclusions: r.exclusions,
      criteria: r.criteria,
    };
    expect(serializeRubric(reordered)).toBe(serializeRubric(r));
  });

  it("rejects invalid imports", () => {
    expect(() => parseRubric('{"version":1}')).toThrow();
  });
});

describe("diffRubrics", () => {
  it("reports added and removed criteria", () => {
    const a = makeRubric();
    const b = forkRubric(a);
    const template = b.criteria[0];
    b.criteria = b.criteria.filter((c) => c.key !== "e");
    if (template) b.criteria.push({ ...template, key: "f", title: "f" });
    const lines = diffRubrics(a, b);
    expect(lines.some((l) => l.kind === "criteria-removed" && l.key === "e")).toBe(true);
    expect(lines.some((l) => l.kind === "criteria-added" && l.key === "f")).toBe(true);
  });

  it("reports weight and scale changes", () => {
    const a = makeRubric();
    const b = forkRubric(a);
    const first = b.criteria[0];
    if (first) {
      first.weight = 9;
      first.scale = [
        { label: "0", description: "x" },
        { label: "1", description: "x" },
        { label: "2", description: "x" },
        { label: "3", description: "x" },
        { label: "4", description: "x" },
        { label: "5", description: "x" },
      ];
    }
    const lines = diffRubrics(a, b);
    expect(lines.some((l) => l.kind === "weight-changed" && l.key === "a")).toBe(true);
    expect(lines.some((l) => l.kind === "scale-changed" && l.key === "a")).toBe(true);
  });

  it("reports exclusion changes", () => {
    const a = makeRubric();
    const b = forkRubric(a);
    b.exclusions = ["school prestige"];
    expect(diffRubrics(a, b).some((l) => l.detail.includes("exclusions"))).toBe(true);
  });
});
