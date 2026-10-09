import { unzipSync } from "fflate";
import { isSupportedExtension } from "../extract/index.js";
import { ExtractionError } from "../extract/types.js";

/** Max total uncompressed bytes accepted from one ZIP (100 MiB). */
export const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;

/** Max entries per ZIP (200 resumes plus directories). */
export const MAX_ZIP_ENTRIES = 300;

/** Max per-file uncompressed size inside a ZIP (10 MiB). */
export const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;

export interface ZipEntry {
  /** Sanitized file name (path stripped, original extension kept). */
  filename: string;
  data: Uint8Array;
}

/**
 * Expand a ZIP buffer into supported document entries.
 *
 * Security: path components are flattened (no traversal via
 * ../ or absolute names), and zip-bomb limits are enforced BEFORE
 * decompression via fflate's filter hook (declared per-entry size,
 * running total, entry count) — a hostile archive never gets its
 * payloads inflated. The post-inflate checks below still run as a
 * second layer against headers that lie about their size.
 * Unsupported extensions are skipped (not errors) so mixed-content
 * archives ingest cleanly.
 */
export function expandZip(data: Uint8Array): {
  entries: ZipEntry[];
  skipped: Array<{ filename: string; reason: string }>;
} {
  const skipped: Array<{ filename: string; reason: string }> = [];
  let inflatedCount = 0;
  let declaredTotal = 0;
  let overLimit = false;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data, {
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        const base = sanitizeEntryName(file.name);
        const ext = base.split(".").pop()?.toLowerCase() ?? "";
        if (!isSupportedExtension(ext)) {
          skipped.push({ filename: base, reason: `unsupported type .${ext}` });
          return false;
        }
        if (file.size > MAX_ZIP_ENTRY_BYTES) {
          skipped.push({ filename: base, reason: "file too large" });
          return false;
        }
        if (inflatedCount >= MAX_ZIP_ENTRIES || declaredTotal + file.size > MAX_ZIP_TOTAL_BYTES) {
          overLimit = true;
          return false;
        }
        inflatedCount++;
        declaredTotal += file.size;
        return true;
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractionError("PARSE_FAILED", `Invalid ZIP archive: ${message}`, err);
  }

  if (overLimit) {
    throw new ExtractionError(
      "UNSUPPORTED_FORMAT",
      `ZIP exceeds the ${MAX_ZIP_ENTRIES}-file or ${MAX_ZIP_TOTAL_BYTES}-byte limit`,
    );
  }

  const entries: ZipEntry[] = [];
  let total = 0;

  for (const name of Object.keys(unzipped)) {
    const base = sanitizeEntryName(name);
    const content = unzipped[name];
    if (!content || content.length === 0) {
      skipped.push({ filename: base, reason: "empty file" });
      continue;
    }
    // Lying-header defense: declared small, inflated big.
    if (content.length > MAX_ZIP_ENTRY_BYTES) {
      skipped.push({ filename: base, reason: "file too large" });
      continue;
    }
    total += content.length;
    if (total > MAX_ZIP_TOTAL_BYTES) {
      throw new ExtractionError(
        "UNSUPPORTED_FORMAT",
        `ZIP expands beyond the ${MAX_ZIP_TOTAL_BYTES} byte limit`,
      );
    }
    entries.push({ filename: base, data: content });
  }

  return { entries, skipped };
}

/**
 * Flatten a ZIP entry name to a safe basename: strips directories
 * (including any ../ traversal) and Windows-style path separators.
 */
export function sanitizeEntryName(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? name;
  const stripped = [...base]
    .filter((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp > 31 && cp !== 127;
    })
    .join("");
  return stripped.trim();
}
