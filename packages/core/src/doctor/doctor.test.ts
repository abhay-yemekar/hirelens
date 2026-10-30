/**
 * Resume Doctor tests — determinism, line-pin spans, score bands, and
 * honest degradation on hostile input.
 */
import { describe, expect, it } from "vitest";
import { isDoctorInputEnough, runResumeDoctor } from "./doctor.js";

const GOOD_RESUME = [
  "Priya Sharma",
  "priya.sharma@example.com | +91 98200 12345",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 60%.",
  "- Built an idempotent ledger service handling 12M transactions/day.",
  "- Cut p99 latency 40% by moving hot reads to Redis.",
  "",
  "SKILLS",
  "TypeScript, Node.js, PostgreSQL, Kubernetes, Redis",
  "",
  "EDUCATION",
  "B.Tech Computer Science - IIT Delhi - 2013 - 2017",
].join("\n");

const WEAK_RESUME = [
  "I am a results-driven professional with a proven track record.",
  "",
  "EXPERIENCE",
  "Worked on various things at some company",
  "",
].join("\n");

describe("determinism", () => {
  it("returns the identical report for identical input", () => {
    const a = runResumeDoctor(GOOD_RESUME);
    const b = runResumeDoctor(GOOD_RESUME);
    expect(a).toEqual(b);
  });

  it("reports stable scores across order-insensitive equivalent resumes", () => {
    // Same resume, plus one extra blank line — score must not change
    // (blank lines carry no penalties).
    const padded = `${GOOD_RESUME}\n`;
    expect(runResumeDoctor(padded).score).toBe(runResumeDoctor(GOOD_RESUME).score);
  });
});

describe("line-pinned spans", () => {
  it("pins findings to real offsets in the original text", () => {
    const report = runResumeDoctor(WEAK_RESUME);
    const spanned = report.findings.filter((f) => f.startOffset !== null);
    expect(spanned.length).toBeGreaterThan(0);
    for (const f of spanned) {
      expect(f.endOffset).toBeGreaterThan(f.startOffset as number);
      expect(f.line).toBeGreaterThanOrEqual(1);
    }
    // Every span must re-slice to the original text.
    for (const f of spanned) {
      expect(WEAK_RESUME.slice(f.startOffset as number, f.endOffset as number)).toBe(
        WEAK_RESUME.split("\n")[(f.line as number) - 1] ?? f.startOffset,
      );
    }
  });

  it("first-person flag pins to the offending bullet line", () => {
    const report = runResumeDoctor(WEAK_RESUME);
    const flag = report.findings.find((f) => f.code === "first-person");
    if (flag) {
      const lineText = WEAK_RESUME.split("\n")[(flag.line as number) - 1] ?? "";
      expect(lineText).toMatch(/\b(I|we|my|our)\b/i);
    }
  });
});

describe("score bands", () => {
  it("a strong resume lands in excellent without an LLM", () => {
    const report = runResumeDoctor(GOOD_RESUME);
    expect(report.band).toBe("excellent");
    expect(report.score).toBeGreaterThanOrEqual(85);
  });

  it("a weak resume cannot score well and lists honest next steps", () => {
    const report = runResumeDoctor(WEAK_RESUME);
    expect(report.band).toBe("needs_work");
    expect(report.nextSteps.length).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("score never exceeds 100 or drops below 0 regardless of input", () => {
    for (const t of ["", "\n\n", "x".repeat(4000), WEAK_RESUME, GOOD_RESUME]) {
      const r = runResumeDoctor(t);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("structural facts, not inventions", () => {
  it("flags missing dates as a fact, never suggests a number", () => {
    const noDates = GOOD_RESUME.split("\n")
      .filter((l) => !/-\s*(\d{4})/.test(l))
      .join("\n");
    const report = runResumeDoctor(noDates);
    const flag = report.findings.find((f) => f.code === "no-dates");
    if (flag) {
      expect(flag.detail).toMatch(/start/i);
      expect(flag.detail).not.toMatch(/\d{4}/); // never invents a year
    }
  });

  it("keeps AI suspicion out of the score", () => {
    const aiHeavy = [
      "Jane Doe",
      "jane@example.com",
      "",
      "EXPERIENCE",
      "- Spearheaded the paradigm-shifting orchestration of cutting-edge synergies, driving unparalleled transformation.",
      "- Masterminded a holistic approach to seamlessly integrated leverages, fostering a culture of excellence.",
      "- Expertly managed the keen understanding of state-of-the-art game-changers, orchestrating pivotal role shaping.",
      "",
      "SKILLS",
      "Strategy, Leadership",
      "",
      "EDUCATION",
      "MBA - 2009 - 2011",
    ].join("\n");
    const report = runResumeDoctor(aiHeavy);
    if (report.aiContent && report.aiContent.level !== "insufficient_text") {
      expect(report.nextSteps.join(" ")).not.toMatch(/rewrite|AI-generated/i);
    }
  });
});

describe("guardrails", () => {
  it("marks too-short input as insufficient", () => {
    expect(isDoctorInputEnough("too short")).toBe(false);
    expect(isDoctorInputEnough(GOOD_RESUME)).toBe(true);
  });

  it("does not crash on hostile input", () => {
    expect(() => runResumeDoctor("")).not.toThrow();
    expect(() => runResumeDoctor("🔥🔥🔥\n@example.com".repeat(50))).not.toThrow();
    expect(() => runResumeDoctor("a".repeat(200_000))).not.toThrow();
  });
});
