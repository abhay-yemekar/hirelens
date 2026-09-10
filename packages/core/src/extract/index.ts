import { extractDocx } from "./docx.js";
import { extractPdf } from "./pdf.js";
import { extractTextFile } from "./text.js";
import { type ExtractedDocument, type ExtractedKind, ExtractionError } from "./types.js";

export { extractDocx } from "./docx.js";
export { extractPdf } from "./pdf.js";
export { extractTextFile } from "./text.js";
export type { ExtractedDocument, ExtractedKind, LayoutHints } from "./types.js";
export {
  ExtractionError,
  extractedDocumentSchema,
  SCAN_CHARS_PER_PAGE_THRESHOLD,
} from "./types.js";

/** Max bytes accepted for a single document (10 MiB). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Extensions we accept, lowercase, no dot. */
export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md"] as const;

export function isSupportedExtension(ext: string): ext is ExtractedKind {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Detect the kind of a buffer from its magic bytes, falling back to
 * the filename extension. Prevents extension-spoofed uploads (a
 * .pdf that is really something else) from taking the wrong path.
 */
export function sniffKind(data: Uint8Array, filename: string): ExtractedKind | "unknown" {
  // ZIP local-file header: DOCX is a ZIP container
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b) {
    return "docx";
  }
  // %PDF- magic
  if (
    data.length >= 5 &&
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46
  ) {
    return "pdf";
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return isSupportedExtension(ext) ? ext : "unknown";
}

/**
 * Extract normalized text from a document buffer.
 *
 * Dispatches on sniffed kind (magic bytes first, extension as
 * fallback). Throws ExtractionError for unsupported or empty
 * inputs - callers own turning that into user-facing errors.
 */
export async function extractDocument(
  data: Uint8Array,
  filename: string,
): Promise<ExtractedDocument> {
  if (data.length === 0) {
    throw new ExtractionError("EMPTY_FILE", `${filename || "document"} is empty`);
  }
  if (data.length > MAX_DOCUMENT_BYTES) {
    throw new ExtractionError(
      "UNSUPPORTED_FORMAT",
      `${filename} exceeds the ${MAX_DOCUMENT_BYTES} byte limit`,
    );
  }

  const kind = sniffKind(data, filename);
  switch (kind) {
    case "pdf":
      return extractPdf(data);
    case "docx":
      return extractDocx(data);
    case "txt":
      return extractTextFile(data, "txt");
    case "md":
      return extractTextFile(data, "md");
    default:
      throw new ExtractionError(
        "UNSUPPORTED_FORMAT",
        `Unsupported file type for ${filename || "document"} (accepted: ${SUPPORTED_EXTENSIONS.join(", ")})`,
      );
  }
}
