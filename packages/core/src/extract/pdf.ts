import { extractText, getDocumentProxy } from "unpdf";
import {
  type ExtractedDocument,
  ExtractionError,
  type LayoutHints,
  SCAN_CHARS_PER_PAGE_THRESHOLD,
} from "./types.js";

/**
 * Extract text from a PDF buffer, preserving page boundaries.
 *
 * unpdf is a serverless-safe wrapper around a bundled PDF.js build.
 * A representative two-column resume will interleave columns in
 * extraction order; layout-aware reading-order reconstruction is a
 * later, separate module and should consume `pages` metadata.
 */
export async function extractPdf(data: Uint8Array): Promise<ExtractedDocument> {
  if (data.length === 0) {
    throw new ExtractionError("EMPTY_FILE", "PDF buffer is empty");
  }

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const result = await extractText(pdf, { mergePages: false });
    pages = result.text.map((page) => page.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password|encrypted/i.test(message)) {
      throw new ExtractionError(
        "PASSWORD_PROTECTED",
        "PDF is password-protected or encrypted",
        err,
      );
    }
    throw new ExtractionError("PARSE_FAILED", `PDF parsing failed: ${message}`, err);
  }

  const joined = pages.join("\n");
  const charCount = joined.length;
  const charsPerPage = charCount / Math.max(pages.length, 1);
  const emptyPageIndices = pages
    .map((text, index) => (text.length < SCAN_CHARS_PER_PAGE_THRESHOLD ? index : -1))
    .filter((index) => index >= 0);
  const lowTextDensity = charsPerPage < SCAN_CHARS_PER_PAGE_THRESHOLD;

  const layoutHints: LayoutHints = {
    lowTextDensity,
    charsPerPage,
    emptyPageIndices,
  };

  return {
    kind: "pdf",
    charCount,
    pageCount: pages.length,
    pages,
    layoutHints,
    needsOcr: lowTextDensity,
  };
}
