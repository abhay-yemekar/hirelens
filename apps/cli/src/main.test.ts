import { describe, expect, it } from "vitest";
import { table } from "./output.js";

describe("table", () => {
  it("aligns columns and draws a header rule", () => {
    const out = table([
      ["RANK", "CANDIDATE", "OVERALL"],
      ["1", "jordan.pdf", "82"],
      ["2", "casey.pdf", "44"],
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(4);
    // Header + rule
    expect(lines[0]).toContain("RANK");
    expect(lines[1]).toMatch(/^─+ {2}─+ {2}─+$/);
    // Numbers right-aligned, names left-aligned
    expect(lines[2]).toContain("1");
    expect(lines[2]).toContain("jordan.pdf");
    expect(lines[2]?.trimEnd().endsWith("82")).toBe(true);
    expect(lines[3]?.trimEnd().endsWith("44")).toBe(true);
  });

  it("keeps unicode names aligned by code point", () => {
    const out = table([
      ["NAME", "SCORE"],
      ["José", "90"],
      ["李雷", "80"],
    ]);
    const lines = out.split("\n");
    // Scores are right-aligned, so the final digit sits in the same column.
    const lastCol = (line: string | undefined): number => (line ? [...line].lastIndexOf("0") : -1);
    expect(lastCol(lines[2])).toBe(lastCol(lines[3]));
  });
});
