import { describe, expect, it } from "vitest";
import { contentHash, findDuplicates, jaro, normalizeEmail, textHash } from "./index.js";

describe("contentHash / textHash", () => {
  it("hashes bytes deterministically", () => {
    const a = contentHash(new TextEncoder().encode("hello"));
    const b = contentHash(new TextEncoder().encode("hello"));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("collapses whitespace and case for text hashing", () => {
    expect(textHash("Hello   World")).toBe(textHash("hello world"));
    expect(textHash("Hello")).not.toBe(textHash("World"));
  });
});

describe("jaro", () => {
  it("scores identical strings 1 and disjoint 0", () => {
    expect(jaro("smith", "smith")).toBe(1);
    expect(jaro("smith", "zzzzz")).toBe(0);
  });

  it("scores close names high", () => {
    expect(jaro("martha", "marhta")).toBeGreaterThan(0.9);
  });
});

describe("normalizeEmail", () => {
  it("strips gmail dots and plus tags", () => {
    expect(normalizeEmail("j.o.hn+tag@gmail.com")).toBe("john@gmail.com");
  });

  it("keeps only plus-tag stripping for other domains", () => {
    expect(normalizeEmail("john+news@example.com")).toBe("john@example.com");
  });
});

describe("findDuplicates", () => {
  const base = {
    contentHashValue: "aaaa",
    textHashValue: "tttt",
    name: "Jordan Avery",
    email: "jordan@example.com",
  };

  it("flags identical content hash as exact", () => {
    const dupes = findDuplicates(base, [{ ...base }]);
    expect(dupes[0]).toMatchObject({ exact: true, reason: "identical file bytes" });
  });

  it("flags same normalized email as fuzzy", () => {
    const dupes = findDuplicates(base, [
      { ...base, contentHashValue: "bbbb", textHashValue: "u", email: "Jordan+hr@example.com" },
    ]);
    expect(dupes[0]).toMatchObject({ exact: false, reason: "same normalized email" });
  });

  it("flags very similar names", () => {
    const dupes = findDuplicates(base, [
      { ...base, contentHashValue: "c", textHashValue: "u", email: null, name: "Jordan Avary" },
    ]);
    expect(dupes[0]?.reason).toBe("very similar name");
  });

  it("passes a genuinely different candidate", () => {
    const dupes = findDuplicates(base, [
      { contentHashValue: "d", textHashValue: "u", name: "Priya Sharma", email: "priya@x.io" },
    ]);
    expect(dupes).toHaveLength(0);
  });
});
