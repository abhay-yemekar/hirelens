type Extracted = {
  skillsFound: string[];
  experienceYears: number | null;
  eduLines: string[];
  summary: string;
};

type Match = {
  score: number;
  strengths: string[];
  gaps: string[];
  overall: string;
};

export function safeJsonFromText(text: string): any | null {
  if (!text) return null;

  // try direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // try to find first {...} block
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;

  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function tokenize(s: string) {
  return (s.toLowerCase().match(/[a-z0-9\+\#\.]{2,}/g) || []);
}

/** very simple heuristic extraction */
export function heuristicExtract(resumeText: string): Extracted {
  const lines = resumeText.split("\n").map(l => l.trim()).filter(Boolean);

  const eduLines = lines.filter(l =>
    /(b\.?tech|bachelor|master|msc|m\.?tech|degree|university|college|diploma)/i.test(l)
  ).slice(0, 8);

  const expMatch = resumeText.match(/(\d+)\+?\s*(years?|yrs?)/i);
  const experienceYears = expMatch ? Number(expMatch[1]) : null;

  // crude skills list by common tokens
  const toks = Array.from(new Set(tokenize(resumeText)));
  const skillsFound = toks.filter(t => t.length <= 18).slice(0, 30);

  return {
    skillsFound,
    experienceYears,
    eduLines,
    summary: lines.slice(0, 3).join(" "),
  };
}

export function heuristicMatch(extracted: Extracted, jdText: string): Match {
  const jdTokens = new Set(tokenize(jdText));
  const resTokens = new Set(extracted.skillsFound.map(s => s.toLowerCase()));

  const strengths = [...resTokens].filter(t => jdTokens.has(t)).slice(0, 12);
  const gaps = [...jdTokens].filter(t => !resTokens.has(t)).slice(0, 12);

  const score = jdTokens.size
    ? Math.round((strengths.length / jdTokens.size) * 100)
    : 0;

  return {
    score,
    strengths,
    gaps,
    overall: score >= 70
      ? "Good fit based on skills overlap."
      : score >= 40
      ? "Partial fit. Some key skills missing."
      : "Low fit. Many JD skills not found in resume.",
  };
}
