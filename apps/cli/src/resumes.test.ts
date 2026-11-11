import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectResumes, mimeFor } from "./resumes.js";

describe("mimeFor", () => {
  it("matches extensions in any letter case", () => {
    expect(mimeFor("resume.pdf")).toBe("application/pdf");
    expect(mimeFor("RESUME.PDF")).toBe("application/pdf");
    expect(mimeFor("cv.Docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(mimeFor("notes.TXT")).toBe("text/plain");
    expect(mimeFor("about.MD")).toBe("text/markdown");
  });

  it("rejects other types and names without an extension", () => {
    expect(mimeFor("photo.png")).toBeUndefined();
    expect(mimeFor("README")).toBeUndefined();
    expect(mimeFor(join("folder.pdf", "README"))).toBeUndefined();
  });
});

describe("collectResumes", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-resumes-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("takes supported files from a directory whatever the extension's case", async () => {
    for (const name of ["a.PDF", "b.pdf", "c.Docx", "d.TXT", "e.png", ".hidden.pdf"]) {
      writeFileSync(join(dir, name), "x");
    }
    mkdirSync(join(dir, "nested.pdf"));

    const files = await collectResumes([dir]);
    expect(files.map((f) => f.name).sort()).toEqual(["a.PDF", "b.pdf", "c.Docx", "d.TXT"]);
    expect(files.find((f) => f.name === "a.PDF")?.mime).toBe("application/pdf");
  });
});
