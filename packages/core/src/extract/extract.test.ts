import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { ExtractionError, extractDocument, extractPdf, sniffKind } from "./index.js";

/** Build a small PDF with fixed text lines per page (ASCII only). */
async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    let y = 800;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 16;
    }
  }
  return doc.save();
}

describe("extractPdf", () => {
  it("extracts per-page text and counts pages", async () => {
    const pageOne = [
      "JORDAN AVERY",
      "Senior Backend Engineer",
      "San Francisco, CA - jordan@example.com",
      "Twelve years building payments infrastructure.",
      "Kubernetes, TypeScript, PostgreSQL, Redis, Docker.",
      "Previously led platform teams at Acme and Globex.",
      "Available for advisory and full-time roles.",
    ];
    const pageTwo = [
      "EXPERIENCE",
      "Senior Backend Engineer - Acme Corp - 2021 - Present",
      "Led the migration of the payments platform to Kubernetes.",
      "Built event-driven TypeScript services handling 40k req/s.",
      "Mentored six engineers across two teams.",
    ];
    const bytes = await makePdf([pageOne, pageTwo]);
    const doc = await extractPdf(bytes);
    expect(doc.kind).toBe("pdf");
    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0]).toContain("JORDAN AVERY");
    expect(doc.pages[1]).toContain("EXPERIENCE");
    expect(doc.needsOcr).toBe(false);
  });

  it("flags a scanned (image-only) PDF as needing OCR", async () => {
    const sparse = Array.from({ length: 3 }, (_, i) => `sparse line ${i + 1}`);
    const bytes = await makePdf([sparse]);
    const doc = await extractPdf(bytes);
    expect(doc.needsOcr).toBe(true);
    expect(doc.layoutHints.lowTextDensity).toBe(true);
  });
});

describe("sniffKind", () => {
  it("detects PDF by magic bytes", () => {
    expect(sniffKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "x.bin")).toBe("pdf");
  });

  it("falls back to extension when magic is absent", () => {
    expect(sniffKind(new Uint8Array([1, 2, 3]), "notes.md")).toBe("md");
    expect(sniffKind(new Uint8Array([1, 2, 3]), "nope.exe")).toBe("unknown");
  });
});

describe("extractDocument", () => {
  it("rejects empty buffers", async () => {
    await expect(extractDocument(new Uint8Array(), "a.pdf")).rejects.toMatchObject({
      code: "EMPTY_FILE",
    });
  });

  it("rejects unsupported types with a typed error", async () => {
    await expect(extractDocument(new Uint8Array([1, 2, 3]), "virus.exe")).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });

  it("rejects files over the size limit without reading them", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    await expect(extractDocument(big, "big.txt")).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("extracts plain text files", async () => {
    const data = new TextEncoder().encode("Hello\nWorld\n");
    const doc = await extractDocument(data, "resume.txt");
    expect(doc.kind).toBe("txt");
    expect(doc.pages[0]).toContain("Hello");
  });
});
