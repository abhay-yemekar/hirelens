import { z } from "zod";

/**
 * Normalized output of document text extraction.
 *
 * `pages` preserves page boundaries so downstream code can report
 * layout hazards (scanned pages, empty pages) and map evidence to
 * page numbers. `layoutHints` records structural observations made
 * during extraction that feed the ATS parse simulation.
 */
export interface ExtractedDocument {
  /** Lowercased file extension without dot: pdf | docx | txt | md */
  kind: ExtractedKind;
  /** Total characters of extracted text. */
  charCount: number;
  /** Number of pages (1 for non-paginated formats). */
  pageCount: number;
  /** Text per page, in reading order. */
  pages: string[];
  /** Structural observations from extraction. */
  layoutHints: LayoutHints;
  /** True when the document looks scanned and needs OCR (not yet implemented). */
  needsOcr: boolean;
}

export type ExtractedKind = "pdf" | "docx" | "txt" | "md";

export interface LayoutHints {
  /** True when text density suggests a scanned/image-only document. */
  lowTextDensity: boolean;
  /** Average characters per page (text.length / pageCount). */
  charsPerPage: number;
  /** Pages with almost no text (possible image-only pages). */
  emptyPageIndices: number[];
}

export const extractedDocumentSchema: z.ZodType<ExtractedDocument> = z.object({
  kind: z.enum(["pdf", "docx", "txt", "md"]),
  charCount: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  pages: z.array(z.string()),
  layoutHints: z.object({
    lowTextDensity: z.boolean(),
    charsPerPage: z.number(),
    emptyPageIndices: z.array(z.number().int().nonnegative()),
  }),
  needsOcr: z.boolean(),
});

/** Errors thrown by extraction, typed per the repo error standard. */
export type ExtractionErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "EMPTY_FILE"
  | "PARSE_FAILED"
  | "PASSWORD_PROTECTED";

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(code: ExtractionErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExtractionError";
    this.code = code;
  }
}

/** Threshold below which a PDF page is considered image-only/scanned. */
export const SCAN_CHARS_PER_PAGE_THRESHOLD = 100;
