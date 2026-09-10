import { describe, expect, it } from "vitest";
import { hashLink } from "./hashChain.js";

describe("hashLink", () => {
  const base = {
    action: "scoring.batch.completed",
    payload: { b: 1, a: { y: 2, x: [3, { k: 4, j: 5 }] } },
    prevHash: "0".repeat(64),
    createdAt: new Date("2026-09-10T18:02:07.512Z"),
  };

  it("is independent of object key insertion order", () => {
    const reordered = {
      createdAt: new Date("2026-09-10T18:02:07.512Z"),
      prevHash: "0".repeat(64),
      payload: { a: { x: [3, { j: 5, k: 4 }], y: 2 }, b: 1 },
      action: "scoring.batch.completed",
    };
    expect(hashLink(reordered)).toBe(hashLink(base));
  });

  it("changes when any field changes", () => {
    expect(hashLink({ ...base, action: "other" })).not.toBe(hashLink(base));
    expect(hashLink({ ...base, prevHash: "1".repeat(64) })).not.toBe(hashLink(base));
    expect(hashLink({ ...base, createdAt: new Date("2026-09-10T18:02:07.513Z") })).not.toBe(
      hashLink(base),
    );
  });

  it("is deterministic across calls", () => {
    expect(hashLink(base)).toBe(hashLink(base));
  });
});
