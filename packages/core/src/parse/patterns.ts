export type SectionKey = "summary" | "experience" | "education" | "skills" | "projects" | "certs";

/**
 * Recognized resume section headers. Anchored to line start so body
 * text mentioning "experience" does not open a section; allows a
 * trailing colon and common separators.
 */
export const SECTION_HEADER_RES: Array<{ key: SectionKey; re: RegExp }> = [
  { key: "summary", re: /^(summary|profile|objective|about me)\b\s*:?$/i },
  {
    key: "experience",
    re: /^(work experience|experience|employment|professional experience|work history)\b\s*:?$/i,
  },
  { key: "education", re: /^(education|academic background|academics)\b\s*:?$/i },
  {
    key: "skills",
    re: /^(skills|technical skills|skills & tools|competencies|technologies)\b\s*:?$/i,
  },
  { key: "projects", re: /^(projects|personal projects|selected projects|key projects)\b\s*:?$/i },
  { key: "certs", re: /^(certifications?|licenses?|certificates?)\b\s*:?$/i },
];

/**
 * Inline headers — the compact-resume form where the header and its
 * content share one line ("SKILLS: TypeScript, Postgres", "Summary: 8
 * years of payments engineering"). Requires a colon separator: that
 * makes the form unambiguous, so there is no false-positive risk from
 * body prose that merely starts with a section word. Callers split the
 * inline content onto its own line (splitInlineHeaders in sections.ts)
 * and the standard end-anchored matching above applies afterwards.
 */
export const INLINE_HEADER_RES: Array<{ key: SectionKey; re: RegExp }> = [
  { key: "summary", re: /^(summary|profile|objective|about me)\s*:\s*(\S.*)$/i },
  {
    key: "experience",
    re: /^(work experience|experience|employment|professional experience|work history)\s*:\s*(\S.*)$/i,
  },
  { key: "education", re: /^(education|academic background|academics)\s*:\s*(\S.*)$/i },
  {
    key: "skills",
    re: /^(skills|technical skills|skills & tools|competencies|technologies)\s*:\s*(\S.*)$/i,
  },
  {
    key: "projects",
    re: /^(projects|personal projects|selected projects|key projects)\s*:\s*(\S.*)$/i,
  },
  { key: "certs", re: /^(certifications?|licenses?|certificates?)\s*:\s*(\S.*)$/i },
];
