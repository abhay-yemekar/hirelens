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
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(html: string): string {
  // Deliberately does NOT decode &lt;/&gt;: angle brackets must never be
  // reintroduced into extracted text, so "&lt;script&gt;" stays literal
  // and is stripped below along with real tags. "&amp;lt;" therefore
  // correctly becomes the literal text "&lt;" (no double decoding).
  return html.replace(/&(?:amp|quot|apos|#39|nbsp);/g, (e) => HTML_ENTITIES[e] ?? e);
}

function htmlToText(html: string): string {
  // Linear character-level parse (no regex-based sanitization): every
  // "<" is consumed together with its matching ">", so no angle bracket
  // can survive into the extracted text by construction.
  const decoded = decodeEntities(html);
  const out: string[] = [];
  let i = 0;
  while (i < decoded.length) {
    const c = decoded[i] ?? "";
    if (c === "<") {
      const close = decoded.indexOf(">", i);
      if (close === -1) break; // unterminated tag: drop the remainder
      const tag = decoded.slice(i + 1, close).toLowerCase();
      if (/^\/(p|div|h[1-6]|li|tr)$/.test(tag)) out.push("\n");
      else if (/^\/t[dh]$/.test(tag)) out.push("\t");
      else if (tag === "li") out.push("- ");
      i = close + 1;
    } else {
      if (c !== ">") out.push(c);
      i++;
    }
  }
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
