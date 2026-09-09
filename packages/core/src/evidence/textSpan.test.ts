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

  it("maps a mid-document match back to source offsets", () => {
    const doc = "EXPERIENCE\nBuilt  a  pipeline\nEDUCATION";
    const span = locateEvidenceSpan(doc, "Built a pipeline");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toContain("Built");
  });
});
