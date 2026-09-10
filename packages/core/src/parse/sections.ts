import type { SectionKey } from "./patterns.js";
import { SECTION_HEADER_RES } from "./patterns.js";

export interface Section {
  key: SectionKey;
  /** Inclusive start line index (the header line). */
  start: number;
  /** Exclusive end line index. */
  end: number;
}

/**
 * Segment lines into known resume sections. A section runs from its
 * header line to the next recognized header (or end of document).
 * Lines before the first header belong to no section.
 */
export function segmentSections(lines: string[]): Map<SectionKey, Section> {
  const found = new Map<SectionKey, Section>();
  const headers: Array<{ key: SectionKey; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line.length === 0 || line.length > 60) continue;
    for (const { key, re } of SECTION_HEADER_RES) {
      if (re.test(line)) {
        headers.push({ key, index: i });
        break;
      }
    }
  }

  headers.sort((a, b) => a.index - b.index);
  for (let i = 0; i < headers.length; i++) {
    const current = headers[i];
    const next = headers[i + 1];
    if (!current) continue;
    const end = next ? next.index : lines.length;
    found.set(current.key, { key: current.key, start: current.index, end });
  }
  return found;
}
