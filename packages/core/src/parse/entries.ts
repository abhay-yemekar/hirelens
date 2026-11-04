import { hasEmailToken, URL_RE } from "./contact.js";
import { DATE_RANGE_RE, extractDateRange } from "./dates.js";
import type { CandidateEducation, CandidateWork } from "./schema.js";
import type { Section } from "./sections.js";

/**
 * Extract work entries from the experience section.
 *
 * Role header lines look like "Title - Company - 2021 - Present" (or
 * with en/em dashes: "Title — Company, City  Mar 2021 – Present").
 * Dates may also sit on their own line under the title line.
 */
export function extractWork(lines: string[], section: Section): CandidateWork[] {
  const roles: CandidateWork[] = [];

  for (let i = section.start + 1; i < section.end; i++) {
    const line = lines[i];
    if (!line) continue;

    const role = matchRoleLine(line);
    if (role) {
      roles.push(role);
      continue;
    }

    const last = roles[roles.length - 1];
    if (last) {
      const dates = extractDateRange(line);
      if (dates && !last.startDate) {
        last.startDate = dates.start;
        last.endDate = dates.end;
        if (dates.current) last.current = true;
        continue;
      }
      if (dates && last.startDate && !last.endDate && last.endDate !== "present") {
        continue;
      }
      // A short line right after the title is often the company name
      if (
        last.position &&
        last.name === "" &&
        line.trim().length >= 2 &&
        line.trim().length <= 60 &&
        !DATE_RANGE_RE.test(line)
      ) {
        last.name = line.trim();
      }
    }
  }

  return roles.filter((r) => r.name.length > 0 || r.position);
}

/**
 * Skills section lines: comma, semicolon, pipe, bullet separated.
 * Returns names in order of appearance, deduplicated.
 */
export function extractSkills(lines: string[], section: Section): string[] {
  const skills: string[] = [];
  const seen = new Set<string>();
  for (let i = section.start + 1; i < section.end; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^(technologies|tools|languages|frameworks|other)\b\s*:?/i.test(line)) {
      continue;
    }
    const parts = line.split(/[,;|/\u2022\u00b7]|\s{2,}/);
    for (const raw of parts) {
      const s = raw
        .trim()
        .replace(/^[-*\u2022]\s*/, "")
        .replace(/[.]$/, "");
      if (s.length < 2 || s.length > 40) continue;
      if (/^\d+$/.test(s)) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push(s);
    }
  }
  return skills;
}

/**
 * Education section: lines pairing a degree with an institution.
 * "BSc Computer Science - University of Somewhere - 2019".
 */
export function extractEducation(lines: string[], section: Section): CandidateEducation[] {
  const entries: CandidateEducation[] = [];
  for (let i = section.start + 1; i < section.end; i++) {
    const line = lines[i];
    if (!line) continue;
    const entry = matchDegreeLine(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Separators between title, company and dates on a role line: a spaced
 * hyphen, pipe or bullet, an unspaced bullet, or an en/em dash with or
 * without spaces ("Engineer—Acme", "Engineer – Acme"). An unspaced hyphen
 * never splits, so "Front-end" and "Co-founder" stay whole; an unspaced
 * dash between two digits is a number range ("10–20"), not a separator.
 */
const ROLE_SEPARATOR_RE =
  /\s+[-|\u2022\u2013\u2014]\s+|\s*\u2022\s*|(?<!\d)[\u2013\u2014]|[\u2013\u2014](?!\d)/;
/** Separator debris left at either end of a part once dates are cut out. */
const PART_EDGE_RE = /^[\s\-|,;\u2022\u2013\u2014]+|[\s\-|,;\u2022\u2013\u2014]+$/g;
/** Bullet glyph opening an achievement line. */
const BULLET_PREFIX_RE = /^[-*>\u2022\u2023\u25aa\u25cf\u00b7\u2219]\s*/;
/** Ends like a sentence ("...hot reads to Redis."); "Acme Inc." does not. */
const SENTENCE_END_RE = /\p{Ll}{4,}[.!?]$/u;

/** Match a role header line: "Title - Company - dates" variants, with
 * hyphens, pipes, bullets, en dashes or em dashes between the parts.
 * Compact single-line form "Title at Company, 2021 - Present" (no dash
 * separator) is handled too: when the line carries a date range but no
 * dash/pipe split, " at " or " @ " separates title from company, and a
 * trailing date range is stripped from the company part.
 * Without a date range, bullet lines and sentences are achievements,
 * never roles, even when a dash splits them in two. */
export function matchRoleLine(line: string): CandidateWork | null {
  let trimmed = line.trim();
  if (trimmed.length < 5 || trimmed.length > 120) return null;
  if (hasEmailToken(trimmed) || URL_RE.test(trimmed)) return null;
  if (/^(skills|technologies|tools)\b/i.test(trimmed)) return null;

  const dates = extractDateRange(trimmed);
  if (!dates && (BULLET_PREFIX_RE.test(trimmed) || SENTENCE_END_RE.test(trimmed))) return null;
  trimmed = trimmed.replace(BULLET_PREFIX_RE, "");

  // Cut the date range out before splitting: its own dash ("2021 - 2023",
  // "Mar 2026 – Present") must not split the line into extra parts.
  const parts = trimmed
    .replace(DATE_RANGE_RE, " ")
    .split(ROLE_SEPARATOR_RE)
    .map((p) => p.replace(PART_EDGE_RE, ""))
    .filter((p) => p.length > 0 && !DATE_RANGE_RE.test(p));

  if (parts.length < 2 && dates) {
    const at = /\s+(?:@|at)\s+/i.exec(trimmed);
    if (at?.index) {
      const title = trimmed.slice(0, at.index).trim();
      const company = trimmed
        .slice(at.index + at[0].length)
        .replace(DATE_RANGE_RE, "")
        .trim()
        .replace(/[,;]+$/, "")
        .trim();
      if (title && company) {
        const entry: CandidateWork = { name: company, position: title };
        entry.startDate = dates.start;
        entry.endDate = dates.end;
        if (dates.current) entry.current = true;
        return entry;
      }
    }
  }

  if (!dates && parts.length < 2) return null;
  const position = parts[0] ?? "";
  const name = parts[1] ?? "";
  if (!position || !name) return null;

  const entry: CandidateWork = { name, position };
  if (dates) {
    entry.startDate = dates.start;
    entry.endDate = dates.end;
    if (dates.current) entry.current = true;
  }
  return entry;
}

const DEGREE_RE =
  /\b(b\.?s\.?c?\.?|b\.?a\.?|m\.?s\.?c?\.?|m\.?a\.?|m\.?eng\.?|mba|ph\.?d\.?|bachelors?(?:\s+(?:of|degree))?|masters?(?:\s+(?:of|degree))?|doctorate|diploma|certificate)\b/i;

function matchDegreeLine(line: string): CandidateEducation | null {
  const trimmed = line.trim();
  if (trimmed.length < 4 || trimmed.length > 140) return null;
  if (hasEmailToken(trimmed) || URL_RE.test(trimmed)) return null;
  const m = DEGREE_RE.exec(trimmed);
  if (!m) return null;

  const entry: CandidateEducation = { institution: "" };
  entry.studyType = titleCase(m[0]);
  const rest = trimmed.replace(m[0], "");
  const parts = rest
    .split(/\s+[-|,]\s+|\s{3,}/)
    .map((p) => p.trim().replace(/^[-\u2022]\s*/, ""))
    .filter((p) => p.length > 2);
  // Prefer the part that looks like an institution: contains a school
  // keyword, or is the last multi-word part (degree fields come first).
  const schoolHints = /(university|college|institute|school|academy|polytechnic)/i;
  const institutionPart =
    parts.find((p) => schoolHints.test(p)) ??
    [...parts].reverse().find((p) => p.split(" ").length >= 2);
  if (institutionPart) entry.institution = institutionPart;
  const years = /\b(19|20)\d{2}\b/.exec(trimmed);
  const year = years?.[0];
  if (years && year) entry.endDate = year;
  return entry.institution.length >= 3 ? entry : null;
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => (w[0] ?? "").toUpperCase() + w.slice(1).toLowerCase());
}
