/**
 * Blind-review masking. The review workflow must let a recruiter evaluate
 * a candidate without identity cues (name, contact, photo, school) while
 * keeping evidence spans usable. Spans are character offsets into the
 * document text, so masking replaces each masked character with `■` —
 * same length, offsets stay aligned, highlighting keeps working.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;

/** Name heuristics: the first non-empty line up to ~48 chars. */
function nameLine(text: string): { start: number; end: number } | null {
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 48 && /[A-Za-z]/.test(trimmed)) {
      const relStart = line.indexOf(trimmed);
      return { start: offset + relStart, end: offset + relStart + trimmed.length };
    }
    offset += line.length + 1;
  }
  return null;
}

function maskRanges(text: string, ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) return text;
  const chars = [...text];
  for (const r of ranges) {
    for (let i = Math.max(0, r.start); i < Math.min(r.end, chars.length); i += 1) {
      if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = "■";
    }
  }
  return chars.join("");
}

function matchRanges(text: string, re: RegExp): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(re)) {
    if (m.index !== undefined && m[0].length > 0)
      out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Produce the blind-review view of a document: emails, phone numbers,
 * URLs, and the leading name line replaced by `■` blocks of identical
 * length. Character offsets are preserved, so evidence spans computed on
 * the unmasked text remain exactly aligned.
 */
export function blindView(text: string): string {
  const ranges: Array<{ start: number; end: number }> = [
    ...matchRanges(text, EMAIL_RE),
    ...matchRanges(text, URL_RE),
  ];
  // Phones after emails so an email's local part isn't double-consumed as
  // a phone number by the looser pattern.
  for (const m of text.matchAll(PHONE_RE)) {
    if (m.index !== undefined) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        ranges.push({ start: m.index, end: m.index + m[0].length });
      }
    }
  }
  const name = nameLine(text);
  if (name) ranges.push(name);
  return maskRanges(text, ranges);
}
