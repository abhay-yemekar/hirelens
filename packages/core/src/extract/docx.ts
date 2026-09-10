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

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(html: string): string {
  return html.replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (e) => HTML_ENTITIES[e] ?? e);
}

function htmlToText(html: string): string {
  // Decode entities BEFORE handling tags (single pass, no double
  // decoding), then convert structural tags to whitespace, then remove
  // every remaining angle bracket so the result provably contains none
  // (e.g. "&lt;script&gt;" decoded to "<script>" is stripped as text).
  return decodeEntities(html)
    .replace(/<\/(p|div|h[1-6]|li|tr)>/g, "\n")
    .replace(/<\/t[dh]>/g, "\t")
    .replace(/<li>/g, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
