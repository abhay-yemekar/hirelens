import type { UploadedFile } from "express-fileupload";
import * as pdfParse from "pdf-parse";

/**
 * Extract plain text from UploadedFile (pdf/txt).
 * pdf-parse has NO default export in ESM, so use namespace import.
 */
export async function extractTextFromFile(file: UploadedFile): Promise<string> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();

  if (ext === "txt") {
    return file.data.toString("utf8");
  }

  if (ext === "pdf") {
    const parsed = await pdfParse.default(file.data); // pdf-parse exports function on default in CJS types
    return (parsed.text || "").trim();
  }

  // fallback
  return file.data.toString("utf8");
}
