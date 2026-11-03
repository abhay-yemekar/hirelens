import { describe, expect, it } from "vitest";
import { blindView } from "./blind.js";

/** Milliseconds a call takes; generous bounds keep this stable on slow CI. */
function timed(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("blindView", () => {
  it("masks emails in their usual forms and keeps offsets aligned", () => {
    const text = [
      "Experience",
      "Reach me at priya.sharma@example.com or a.b+tag@sub.domain.co.uk.",
      "Old address: weird%local@host.io",
    ].join("\n");
    const masked = blindView(text);
    expect(masked).toHaveLength(text.length);
    for (const email of [
      "priya.sharma@example.com",
      "a.b+tag@sub.domain.co.uk",
      "weird%local@host.io",
    ]) {
      expect(masked).not.toContain(email);
      const at = text.indexOf(email);
      expect(masked.slice(at, at + email.length)).toBe("■".repeat(email.length));
    }
    expect(masked).toContain("Reach me at ");
  });

  // Regression for CodeQL js/polynomial-redos (#152): the unbounded pattern
  // took ~0.9 s on 40,000 "%" and ~5.5 s on an "@" followed by 100,000
  // characters of "a.", growing with the square of the length.
  it("stays linear on text built to make the email pattern backtrack", () => {
    const runOfLocalChars = "Experience\n".concat("%".repeat(200_000));
    const dottedAfterAt = "Experience\nx@".concat("a.".repeat(100_000));
    expect(timed(() => blindView(runOfLocalChars))).toBeLessThan(1000);
    expect(timed(() => blindView(dottedAfterAt))).toBeLessThan(1000);
  });

  it("still masks the domain and the last 64 characters of an over-long local part", () => {
    const local = "a".repeat(80);
    const text = `Experience\n${local}@example.com`;
    const masked = blindView(text);
    expect(masked).not.toContain("@example.com");
    expect(masked.endsWith("■".repeat(64 + "@example.com".length))).toBe(true);
  });
});
