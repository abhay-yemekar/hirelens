import { describe, expect, it } from "vitest";
import { createMockModel, type LanguageModel } from "../llm/index.js";
import { deriveRubric, MAX_JD_CHARS, slugifyKey } from "./derive.js";
import { RubricSchema } from "./schema.js";

const GoodDerivation = {
  title: "Senior Backend Engineer",
  criteria: [
    {
      key: "system design",
      title: "System Design",
      weight: 3,
      doNotUse: ["school prestige"],
      scale: [
        { label: "0", description: "no evidence" },
        { label: "1", description: "minimal" },
        { label: "2", description: "basic" },
        { label: "3", description: "solid" },
        { label: "4", description: "strong" },
        { label: "5", description: "expert" },
      ],
    },
    {
      key: "api-design",
      title: "API Design",
      weight: 2,
      doNotUse: [],
      scale: [
        { label: "0", description: "a" },
        { label: "1", description: "b" },
        { label: "2", description: "c" },
        { label: "3", description: "d" },
        { label: "4", description: "e" },
        { label: "5", description: "f" },
      ],
    },
    {
      key: "databases",
      title: "Databases",
      weight: 2,
      doNotUse: [],
      scale: [
        { label: "0", description: "a" },
        { label: "1", description: "b" },
        { label: "2", description: "c" },
        { label: "3", description: "d" },
        { label: "4", description: "e" },
        { label: "5", description: "f" },
      ],
    },
    {
      key: "testing",
      title: "Testing",
      weight: 1,
      doNotUse: [],
      scale: [
        { label: "0", description: "a" },
        { label: "1", description: "b" },
        { label: "2", description: "c" },
        { label: "3", description: "d" },
        { label: "4", description: "e" },
        { label: "5", description: "f" },
      ],
    },
    {
      key: "ops",
      title: "Operations",
      weight: 1,
      doNotUse: [],
      scale: [
        { label: "0", description: "a" },
        { label: "1", description: "b" },
        { label: "2", description: "c" },
        { label: "3", description: "d" },
        { label: "4", description: "e" },
        { label: "5", description: "f" },
      ],
    },
  ],
  exclusions: ["years-of-experience as proxy for seniority"],
};

describe("slugifyKey", () => {
  it("produces kebab-case slugs and de-duplicates", () => {
    expect(slugifyKey("System Design!")).toBe("system-design");
    expect(slugifyKey("  API  &  Design ")).toBe("api-design");
    expect(slugifyKey("")).toBe("criterion");
  });
});

describe("deriveRubric", () => {
  it("derives a schema-valid rubric with normalized keys", async () => {
    const { model } = createMockModel({ args: GoodDerivation });
    const { rubric, audit } = await deriveRubric(
      model as LanguageModel,
      "Hiring a backend engineer",
    );
    expect(RubricSchema.safeParse(rubric).success).toBe(true);
    expect(rubric.key).toBe("senior-backend-engineer");
    expect(rubric.criteria[0]?.key).toBe("system-design");
    expect(rubric.criteria).toHaveLength(5);
    expect(audit.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(audit.repaired).toBe(false);
  });

  it("de-duplicates colliding keys deterministically", async () => {
    const dupe = structuredClone(GoodDerivation);
    const first = dupe.criteria[0];
    if (first) dupe.criteria[1] = { ...first };
    const { model } = createMockModel({ args: dupe });
    const { rubric } = await deriveRubric(model as LanguageModel, "jd");
    const keys = rubric.criteria.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k.startsWith("system-design")).length).toBe(2);
  });

  it("truncates oversized JDs deterministically", async () => {
    const { model, calls } = createMockModel({ args: GoodDerivation });
    const jd = "x".repeat(MAX_JD_CHARS + 5000);
    await deriveRubric(model as LanguageModel, jd);
    expect(calls[0]?.prompt.length).toBeLessThan(MAX_JD_CHARS + 100);
    expect(calls[0]?.prompt).toContain("…");
  });

  it("throws when both attempts propose fewer than 5 criteria", async () => {
    const short = { ...GoodDerivation, criteria: GoodDerivation.criteria.slice(0, 2) };
    const { model } = createMockModel({ argsPerCall: [short, short] });
    await expect(deriveRubric(model as LanguageModel, "jd")).rejects.toThrow(/violated/);
  });

  it("surfaces schema violations as SchemaViolationError", async () => {
    const { model } = createMockModel({ args: { title: "x", criteria: [] } });
    await expect(deriveRubric(model as LanguageModel, "jd")).rejects.toThrow(/violated/);
  });
});
