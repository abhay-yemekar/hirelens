import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ExtractionError } from "../extract/types.js";
import { expandZip, sanitizeEntryName } from "./expand.js";

function makeZip(files: Record<string, string>): Uint8Array {
  const u8s: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    u8s[name] = strToU8(content);
  }
  return zipSync(u8s);
}

describe("expandZip", () => {
  it("expands supported files and reports skipped ones", () => {
    const zip = makeZip({
      "a/resumes/jordan.txt": "JORDAN AVERY\nEngineer",
      "b/priya.md": "# Priya",
      "c/ignore.exe": "MZ",
      "d/empty.txt": "",
    });
    const { entries, skipped } = expandZip(zip);
    expect(entries.map((e) => e.filename)).toEqual(["jordan.txt", "priya.md"]);
    expect(skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining(["unsupported type .exe", "empty file"]),
    );
    expect(entries[0]?.data.length).toBeGreaterThan(0);
  });

  it("flattens traversal paths", () => {
    expect(sanitizeEntryName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeEntryName("a\\b\\resume.pdf")).toBe("resume.pdf");
  });

  it("rejects corrupt archives with a typed error", () => {
    expect(() => expandZip(new TextEncoder().encode("not a zip"))).toThrow(ExtractionError);
  });
});
