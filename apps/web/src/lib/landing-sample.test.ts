/**
 * The landing shots must only show what the engine produces. These checks
 * fail if the recording drifts from the demo resumes, the rubric or the
 * current engine, or if the shots' numbers contradict each other.
 */

import { describe, expect, it } from "vitest";
import { DEMO_RESUMES, DEMO_RUBRIC } from "./demo-data";
import {
  DECISIONS,
  excerptAround,
  SAMPLE_AUDIT,
  SAMPLE_CANDIDATES,
  SAMPLE_RUN,
  topCriteria,
} from "./landing-sample";
import recording from "./landing-sample.json";

const textOf = (id: string) => DEMO_RESUMES.find((r) => r.id === id)?.text ?? "";

describe("landing sample recording", () => {
  it("covers every demo resume once, each with a recruiter decision", () => {
    const ids = recording.candidates.map((c) => c.id).sort();
    expect(ids).toEqual(DEMO_RESUMES.map((r) => r.id).sort());
    expect(Object.keys(DECISIONS).sort()).toEqual(ids);
  });

  it("was scored against the current rubric, every criterion present", () => {
    expect(recording.rubricVersion).toBe(DEMO_RUBRIC.version);
    const keys = DEMO_RUBRIC.criteria.map((c) => c.key);
    for (const c of recording.candidates) {
      expect(c.criteria.map((s) => s.key)).toEqual(keys);
    }
  });

  it("only cites evidence that is the resume's own text at its offsets", () => {
    for (const c of recording.candidates) {
      const text = textOf(c.id);
      for (const s of c.criteria) {
        if (s.evidence === null) {
          // The engine never keeps a positive score without evidence.
          expect(s.score).toBe(0);
          continue;
        }
        expect(text.slice(s.evidence.startOffset, s.evidence.endOffset)).toBe(
          s.evidence.quotedText,
        );
      }
    }
  });

  it("shows the overall the engine computed for the run", () => {
    for (const c of SAMPLE_CANDIDATES) {
      const recorded = recording.candidates.find((r) => r.id === c.id);
      expect(c.overall).toBe(recorded?.overall);
    }
  });

  it("names the provider and model that produced it", () => {
    expect(SAMPLE_RUN.model).not.toBe("");
    expect(SAMPLE_RUN.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("landing shots", () => {
  it("ranks candidates by overall score", () => {
    const overalls = SAMPLE_CANDIDATES.map((c) => c.overall);
    expect(overalls).toEqual([...overalls].sort((a, b) => b - a));
  });

  it("audits exactly the candidates in the queue", () => {
    const considered = SAMPLE_AUDIT.rows.reduce((n, r) => n + r.considered, 0);
    expect(considered).toBe(SAMPLE_CANDIDATES.length);
  });

  it("has a comparable reference group, so its verdict is a real test", () => {
    expect(SAMPLE_AUDIT.referenceGroup).not.toBe("");
    expect(SAMPLE_AUDIT.referenceGroup).not.toBe("undisclosed");
  });

  it("highlights exactly the evidence span inside whole resume lines", () => {
    const featured = SAMPLE_CANDIDATES[0];
    const evidence = featured ? topCriteria(featured, 3)[0]?.evidence : null;
    if (!featured || !evidence) throw new Error("expected a featured candidate with evidence");
    const { before, marked, after } = excerptAround(featured.text, evidence);
    expect(marked).toBe(evidence.quotedText);
    expect(featured.text).toContain(`${before}${marked}${after}`);
    const start = featured.text.indexOf(`${before}${marked}`);
    expect(start === 0 || featured.text[start - 1] === "\n").toBe(true);
  });

  it("shows each evidence passage once in the rubric breakdown", () => {
    for (const c of SAMPLE_CANDIDATES) {
      const starts = topCriteria(c, 3).map((s) => s.evidence?.startOffset);
      expect(new Set(starts).size).toBe(starts.length);
    }
  });
});
