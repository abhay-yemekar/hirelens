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
