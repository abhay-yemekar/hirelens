import { describe, expect, it } from "vitest";
import { chunkText } from "./index.js";

describe("chunkText", () => {
  it("returns an empty array for blank input", () => {
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("keeps short documents as one chunk with real offsets", () => {
    const text = "Jane Doe — Senior Backend Engineer. Built payment systems at scale.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.startOffset).toBe(0);
    expect(chunks[0]!.text.length).toBeLessThanOrEqual(text.length);
  });

  it("splits long documents into non-overlapping-order chunks within the target size", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Experience line ${i} with skills`).join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1210);
      expect(c.endOffset).toBeGreaterThan(c.startOffset);
    }
    // Chunks advance in document order without repeating a start.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startOffset).toBeGreaterThan(chunks[i - 1]!.startOffset);
    }
  });

  it("terminates on a document with no whitespace at all", () => {
    const text = "x".repeat(5000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startOffset).toBeGreaterThan(chunks[i - 1]!.startOffset);
    }
  });
});
