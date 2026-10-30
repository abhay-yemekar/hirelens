import { describe, expect, it } from "vitest";
import { locateEvidenceSpan } from "./textSpan.js";

describe("locateEvidenceSpan", () => {
  it("finds an exact match with correct offsets", () => {
    const doc = "Name: Ada\nSkills: Python, Docker\n";
    const span = locateEvidenceSpan(doc, "Python");
    expect(span?.quotedText).toBe("Python");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toBe("Python");
  });

  it("tolerates whitespace differences via fallback", () => {
    const doc = "Led  the  migration   of services";
    const span = locateEvidenceSpan(doc, "Led the migration");
    expect(span?.startOffset).toBe(0);
    expect(span?.quotedText.replace(/\s+/g, " ")).toBe("Led the migration");
  });

  it("returns null for text not in the document", () => {
    expect(locateEvidenceSpan("alpha beta", "gamma")).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(locateEvidenceSpan("alpha beta", "")).toBeNull();
  });

  // Regression: gpt-oss quoted "on\u2011call" (non-breaking hyphen) for a
  // resume that says "on-call", so the score was withheld.
  it("matches a non-breaking hyphen in the quote to an ASCII hyphen", () => {
    const doc = "- CI/CD pipelines, monitoring, and on-call for web services.";
    const span = locateEvidenceSpan(doc, "on\u2011call for web services.");
    expect(span?.quotedText).toBe("on-call for web services.");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toBe(span?.quotedText);
  });

  it("matches every dash variant, both ways, and keeps the resume's own text", () => {
    for (const dash of ["\u2010", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212"]) {
      const doc = `Senior Engineer ${dash} Acme ${dash} 2021${dash}present`;
      expect(locateEvidenceSpan(doc, "Acme - 2021-present")?.quotedText).toBe(
        `Acme ${dash} 2021${dash}present`,
      );
      expect(locateEvidenceSpan("Acme - 2021-present", `Acme ${dash} 2021`)?.startOffset).toBe(0);
    }
  });

  it("matches curly quotes to straight quotes", () => {
    const doc = "Won the \u201CBest Platform\u201D award for the team\u2019s work";
    const span = locateEvidenceSpan(doc, `"Best Platform" award for the team's work`);
    expect(span?.quotedText).toBe(doc.slice("Won the ".length));
  });

  it("folds variants in the whitespace fallback too", () => {
    const doc = "Owned  on\u2011call\n  rotation";
    const span = locateEvidenceSpan(doc, "on-call rotation");
    expect(span?.startOffset).toBe(7);
    expect(span?.endOffset).toBe(doc.length);
  });

  it("still rejects quotes that differ by more than typography", () => {
    expect(locateEvidenceSpan("on-call for web services", "on call for web services")).toBeNull();
  });

  it("maps a mid-document match back to source offsets", () => {
    const doc = "EXPERIENCE\nBuilt  a  pipeline\nEDUCATION";
    const span = locateEvidenceSpan(doc, "Built a pipeline");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toContain("Built");
  });
});
