import { ParseError } from "./schema.js";

export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Loose phone pattern; callers must verify digit count. */
export const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?/;

export const URL_RE = /https?:\/\/[^\s<>)"']+/;

export function countDigits(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

export function findEmail(lines: string[]): string | null {
  for (const line of lines) {
    const m = EMAIL_RE.exec(line);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

export function findPhone(lines: string[]): string | null {
  for (const line of lines) {
    // Skip lines that are clearly dates or ids
    if (/^\d{4}[-/]\d{2,4}/.test(line.trim())) continue;
    const m = PHONE_RE.exec(line);
    if (m && countDigits(m[0]) >= 7 && countDigits(m[0]) <= 15) {
      return m[0].trim();
    }
  }
  return null;
}

export function findWebsite(lines: string[], email: string | null): string | null {
  const skip = email ? (email.split("@")[1] ?? "") : "";
  for (const line of lines) {
    const m = URL_RE.exec(line);
    if (!m) continue;
    const url = m[0].replace(/[.,;]+$/, "");
    const host = (url.replace(/^https?:\/\//, "").split("/")[0] ?? "").toLowerCase();
    if (skip && host.endsWith(skip)) continue;
    if (/(github\.com|linkedin\.com)/i.test(host)) continue;
    return url;
  }
  return null;
}

export interface ProfileRef {
  network: string;
  username: string;
  url?: string;
}

export function findProfiles(lines: string[]): ProfileRef[] {
  const profiles: ProfileRef[] = [];
  const seen = new Set<string>();
  // Matches both https://github.com/x and bare github.com/x as written on resumes
  const GH = /(?:https?:\/\/)?github\.com\/([A-Za-z0-9-]{1,39})/gi;
  const LI = /(?:https?:\/\/)?linkedin\.com\/in\/([A-Za-z0-9%-]{2,64})/gi;
  for (const line of lines) {
    for (const re of [GH, LI]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      for (;;) {
        m = re.exec(line);
        if (!m) break;
        const captured = m[1];
        if (!captured) continue;
        const isGithub = re === GH;
        const network = isGithub ? "github" : "linkedin";
        const key = `${network}:${captured.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const path = isGithub ? `github.com/${captured}` : `linkedin.com/in/${captured}`;
        profiles.push({ network, username: captured, url: `https://${path}` });
      }
    }
  }
  return profiles;
}

/** Confident name detection: short early line of name-like words. */
export function findName(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const t = line.trim();
    if (t.length < 2 || t.length > 48) continue;
    if (EMAIL_RE.test(t) || URL_RE.test(t) || PHONE_RE.test(t)) continue;
    if (/\d/.test(t)) continue;
    if (t.includes("@") || t.includes("|")) continue;
    const words = t.split(/\s+/);
    if (words.length < 1 || words.length > 5) continue;
    const letters = t.replace(/[^A-Za-z]/g, "").length;
    if (letters < t.replace(/\s/g, "").length * 0.6) continue;
    if (/^(resume|curriculum|vitae|cv)$/i.test(t)) continue;
    return t;
  }
  return null;
}

/** "Location: Berlin" or a "City, ST" fragment in the header block. */
export function findLocation(lines: string[]): string | null {
  for (const line of lines.slice(0, 12)) {
    const labeled = /^locations?\s*[:\u2013-]\s*(.{2,64})$/i.exec(line.trim());
    if (labeled?.[1]) return labeled[1].trim();
  }
  for (const line of lines.slice(0, 12)) {
    const m = /\b([A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)\b/.exec(
      line,
    );
    if (m?.[1] && m?.[2] && !EMAIL_RE.test(line) && countDigits(line) <= 4) {
      return `${m[1]}, ${m[2]}`;
    }
  }
  return null;
}

const LANGUAGE_MARKERS: Record<string, string[]> = {
  en: ["the", "and", "with", "experience", "management", "developed", "responsible"],
  de: ["und", "der", "die", "das", "mit", "erfahrung", "verantwortlich", "f\u00fcr"],
  fr: ["et", "le", "les", "avec", "exp\u00e9rience", "gestion", "d\u00e9velopp\u00e9"],
  es: ["y", "el", "los", "con", "experiencia", "gesti\u00f3n", "desarroll\u00f3"],
  pt: ["e", "os", "com", "experi\u00eancia", "gest\u00e3o", "desenvolveu"],
  it: ["e", "il", "con", "esperienza", "gestione", "sviluppato"],
  nl: ["en", "het", "met", "ervaring", "verantwoordelijk", "ontwikkeld"],
};

/**
 * Stopword-frequency language detection. Deterministic and offline;
 * good enough to tag the document and route parsing, not a CLD.
 */
export function detectLanguage(text: string): { code: string; tag: string } {
  const words = text.toLowerCase().match(/[a-z\u00e0-\u017f]+/g) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best = "en";
  let bestScore = -1;
  for (const [code, markers] of Object.entries(LANGUAGE_MARKERS)) {
    let score = 0;
    for (const m of markers) score += counts.get(m) ?? 0;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  const tags: Record<string, string> = {
    en: "en-US",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    pt: "pt-BR",
    it: "it-IT",
    nl: "nl-NL",
  };
  return { code: best, tag: tags[best] ?? "en-US" };
}

export function requireLines(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 3) {
    throw new ParseError("LOW_INFORMATION", "Document has too little text to parse");
  }
  return lines;
}
