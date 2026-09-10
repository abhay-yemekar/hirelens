import { type ExtractedDocument, ExtractionError } from "./types.js";

/**
 * Extract text from plain-text or Markdown files.
 *
 * Both are already text; we normalize line endings and collapse
 * runs of blank lines. Markdown markup is kept verbatim - it is
 * meaningful content for a resume and downstream parsing is
 * markdown-agnostic.
 */
export async function extractTextFile(
  data: Uint8Array,
  kind: "txt" | "md",
): Promise<ExtractedDocument> {
  if (data.length === 0) {
    throw new ExtractionError("EMPTY_FILE", `${kind.toUpperCase()} file is empty`);
  }

  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(data)
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length === 0) {
    throw new ExtractionError("PARSE_FAILED", `${kind.toUpperCase()} file decoded to empty text`);
  }

  const charCount = text.length;
  return {
    kind,
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
