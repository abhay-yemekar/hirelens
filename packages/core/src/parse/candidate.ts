import {
  detectLanguage,
  findEmail,
  findLocation,
  findName,
  findPhone,
  findProfiles,
  findWebsite,
  type ProfileRef,
  requireLines,
} from "./contact.js";
import { extractEducation, extractSkills, extractWork } from "./entries.js";
import { type Candidate, ParseError } from "./schema.js";
import { segmentSections } from "./sections.js";

export { ParseError };

/**
 * Parse resume text into a structured, JSON-Resume-compatible
 * candidate profile. Heuristic and fully deterministic: same text
 * in, same Candidate out - no model in the loop. LLM-assisted
 * parsing layers on top of this later and validates against the
 * same Zod schema.
 */
export function parseCandidate(text: string): Candidate {
  const lines = requireLines(text);

  const email = findEmail(lines);
  const phone = findPhone(lines);
  const website = findWebsite(lines, email);
  const profiles: ProfileRef[] = findProfiles(lines);
  const name = findName(lines);
  const location = findLocation(lines);
  const sections = segmentSections(lines);

  const workSection = sections.get("experience");
  const work = workSection ? extractWork(lines, workSection) : [];
  const eduSection = sections.get("education");
  const education = eduSection ? extractEducation(lines, eduSection) : [];
  const skillsSection = sections.get("skills");
  const skills = skillsSection ? extractSkills(lines, skillsSection) : [];

  const summarySection = sections.get("summary");
  const summary = summarySection
    ? joinParagraph(lines.slice(summarySection.start + 1, summarySection.end), 3)
    : null;

  const lang = detectLanguage(text);

  const candidate: Candidate = {
    name,
    email,
    phone,
    location,
    website,
    profiles: profiles.map((p) =>
      p.url ? { ...p } : { network: p.network, username: p.username },
    ),
    summary,
    work,
    education,
    skills,
    certifications: (() => {
      const certsSection = sections.get("certs");
      return certsSection ? extractCerts(lines, certsSection.start, certsSection.end) : [];
    })(),
    language: lang.code,
    languageTag: lang.tag,
  };

  const tooEmpty =
    candidate.name === null &&
    candidate.email === null &&
    candidate.work.length === 0 &&
    candidate.skills.length === 0;
  if (tooEmpty) {
    throw new ParseError(
      "LOW_INFORMATION",
      "Could not extract any name, contact, or experience data from the document",
    );
  }
  return candidate;
}

function joinParagraph(lines: string[], maxLines: number): string | null {
  const kept: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (kept.length > 0) break;
      continue;
    }
    kept.push(line.trim());
    if (kept.length >= maxLines) break;
  }
  return kept.length > 0 ? kept.join(" ") : null;
}

/** Certification lines under the certs header, cleaned up. */
function extractCerts(lines: string[], start: number, end: number): string[] {
  const certs: string[] = [];
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const cleaned = line
      .trim()
      .replace(/^[-*\u2022]\s*/, "")
      .trim();
    if (cleaned.length < 3 || cleaned.length > 120) continue;
    if (/^(certifications?|licenses?)\b\s*:?$/i.test(cleaned)) continue;
    certs.push(cleaned);
  }
  return certs;
}
