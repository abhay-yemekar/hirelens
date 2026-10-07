import type { SectionKey } from "./patterns.js";
import { INLINE_HEADER_RES, SECTION_HEADER_RES } from "./patterns.js";

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
 *
 * Compact-resume handling: inline header lines ("SKILLS: TypeScript,
 * Postgres") are split into a header line plus a body line first, so
 * they segment exactly like a two-line header. Idempotent: pre-split
 * input re-splits to itself (a bare header has no inline content).
 */
export function segmentSections(inputLines: string[]): Map<SectionKey, Section> {
  const lines = splitInlineHeaders(inputLines);
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

/**
 * Rewrite "HEADER: inline content" lines into two lines — the header and
 * its content — so downstream extractors see the content as body. The
 * colon separator keeps this unambiguous: body prose that merely starts
 * with a section word (" Skills improve the match") has no separator.
 * Bullet- and number-prefixed lines are left alone: they are body prose
 * (splitting one could truncate the surrounding section), and the total
 * length does not matter because the anchored regex is what decides.
 * Exported so parseCandidate can normalize the line array once, keeping
 * section indexes and extractor input on the same array.
 */
export function splitInlineHeaders(lines: string[]): string[] {
  let changed = false;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 240) return line;
    // Bullets and numbered items are body content, never section headers.
    if (/^[-*\u2022\u00b7>]|^\d+[.)]/.test(trimmed)) return line;
    for (const { key, re } of INLINE_HEADER_RES) {
      const m = re.exec(trimmed);
      if (m?.[2]) {
        changed = true;
        const indent = line.slice(0, line.length - trimmed.length);
        return `${indent}${titleCase(key)}:\n${m[2]}`;
      }
    }
    return line;
  });
  if (!changed) return lines;
  // The rewrite introduced embedded newlines; flatten them.
  return out.flatMap((l) => l.split("\n"));
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => (w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w));
}
