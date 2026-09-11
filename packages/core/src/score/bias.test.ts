import { describe, expect, it } from "vitest";
import { biasAudit, selectionRate } from "./bias.js";

describe("selectionRate", () => {
  it("computes selected/considered and treats empty groups as 0", () => {
    expect(selectionRate({ group: "a", considered: 10, selected: 7 })).toBe(0.7);
    expect(selectionRate({ group: "b", considered: 0, selected: 0 })).toBe(0);
  });
});

describe("biasAudit", () => {
  it("flags groups below four-fifths of the reference rate", () => {
    const audit = biasAudit([
      { group: "reference", considered: 40, selected: 30 }, // 0.75
      { group: "below", considered: 40, selected: 20 }, // 0.50 → 0.667 → flagged
      { group: "edge", considered: 40, selected: 24 }, // 0.60 → 0.80 → pass
    ]);
    expect(audit.referenceGroup).toBe("reference");
    expect(audit.allPass).toBe(false);
    const byGroup = new Map(audit.rows.map((r) => [r.group, r]));
    expect(byGroup.get("below")?.adverseImpact).toBe(true);
    expect(byGroup.get("edge")?.adverseImpact).toBe(false); // exactly 0.8 passes
    expect(byGroup.get("reference")?.adverseImpact).toBeNull();
    expect(byGroup.get("below")?.parityDifference).toBeCloseTo(0.25, 5);
  });

  it("reports empty groups without flagging them", () => {
    const audit = biasAudit([
      { group: "a", considered: 10, selected: 5 },
      { group: "empty", considered: 0, selected: 0 },
    ]);
    const empty = audit.rows.find((r) => r.group === "empty");
    expect(empty?.adverseImpact).toBeNull();
    expect(empty?.impactRatio).toBeNull();
    expect(audit.allPass).toBe(true);
  });

  it("handles an all-empty pool", () => {
    const audit = biasAudit([{ group: "only", considered: 0, selected: 0 }]);
    expect(audit.referenceGroup).toBe("");
    expect(audit.referenceRate).toBe(0);
    expect(audit.overallRate).toBe(0);
    expect(audit.allPass).toBe(true);
  });

  it("picks the highest-rate group as reference (EEOC practice)", () => {
    const audit = biasAudit([
      { group: "low", considered: 20, selected: 4 }, // 0.2
      { group: "high", considered: 20, selected: 12 }, // 0.6 ← reference
      { group: "mid", considered: 20, selected: 9 }, // 0.45 → 0.75 → flagged
    ]);
    expect(audit.referenceGroup).toBe("high");
    expect(audit.rows.find((r) => r.group === "low")?.adverseImpact).toBe(true);
    expect(audit.rows.find((r) => r.group === "mid")?.adverseImpact).toBe(true);
    expect(audit.allPass).toBe(false);
  });

  it("passes when rates are equal", () => {
    const audit = biasAudit([
      { group: "x", considered: 10, selected: 5 },
      { group: "y", considered: 10, selected: 5 },
    ]);
    expect(audit.allPass).toBe(true);
    expect(audit.rows.every((r) => r.parityDifference === 0 || r.group === "y")).toBe(true);
  });
});
