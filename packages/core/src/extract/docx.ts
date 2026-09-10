import mammoth from "mammoth";
import { type ExtractedDocument, ExtractionError } from "./types.js";

/**
 * Extract text from a DOCX buffer with mammoth.
 *
 * Mammoth converts semantically (paragraphs, headings, lists) and
 * ignores presentational containers, which yields stable reading
 * order for single-column resumes. Tables become tab-separated
 * text, which downstream ATS simulation flags as a layout hazard.
 */
export async function extractDocx(data: Uint8Array): Promise<ExtractedDocument> {
  if (data.length === 0) {
    throw new ExtractionError("EMPTY_FILE", "DOCX buffer is empty");
  }

  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
    html = result.value;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractionError("PARSE_FAILED", `DOCX parsing failed: ${message}`, err);
  }

  const text = htmlToText(html);
  const charCount = text.length;
  if (charCount === 0) {
    throw new ExtractionError("PARSE_FAILED", "DOCX conversion produced no text");
  }

  return {
    kind: "docx",
    charCount,
    pageCount: 1,
    pages: [text],
    layoutHints: {
      lowTextDensity: false,
      charsPerPage: charCount,
      emptyPageIndices: [],
    },
    needsOcr: false,
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|tr)>/g, "\n")
    .replace(/<\/t[dh]>/g, "\t")
    .replace(/<li>/g, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
