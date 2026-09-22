/**
 * AI-content detection (v1.2) — deterministic heuristics, no LLM.
 *
 * Flags resume text that *looks* LLM-generated so a recruiter can probe
 * authenticity in the interview. Deliberately conservative — false
 * accusations against real candidates are the failure mode that matters:
 *  - Signals: high-signal phrases ("spearheaded", "leverage synergies",
 *    "demonstrated proficiency"), rule-of-three constructions, em-dash
 *    density, uniform sentence rhythm, polished transitions.
 *  - Output: a suspicion level (low / moderate / notable) plus the exact
 *    matching sentences, always framed as "worth probing", never as proof.
 *  - Short or bullet-only resumes degrade honestly to "not enough text".
 */

export type AiSuspicion = "low" | "moderate" | "notable" | "insufficient_text";

export interface AiContentSignal {
  /** The sentence or bullet that tripped a signal. */
  text: string;
  /** Which heuristic fired. */
  signal: "phrase" | "rule_of_three" | "transition" | "rhythm";
}

export interface AiContentReport {
  level: AiSuspicion;
  /** 0–100 heuristic composite; present only when enough text exists. */
  score: number | null;
  signals: AiContentSignal[];
  /** One-line human explanation for the UI. */
  summary: string;
}

/** High-signal AI-typical phrases (lowercase). Buzzwords alone are weak
 * evidence — real people write "spearheaded" too — so each hit is weak
 * but several across a resume compound. */
const AI_PHRASES: readonly string[] = [
  "spearheaded",
  "leverage synergies",
  "demonstrated proficiency",
  "proven track record",
  "results-driven",
  "detail-oriented professional",
  "strong acumen",
  "spear-heading",
  "in today's fast-paced",
  "wears many hats",
  "seamlessly integrated",
  "holistic approach",
  "unparalleled",
  "cornerstone of",
  "testament to my",
  "navigated the complexities",
  "embarked on",
  "fostered a culture of",
  "orchestrated",
  "pivotal role in shaping",
  "keen understanding",
  "expertly managed",
  "adept at",
  "utilized cutting-edge",
  "state-of-the-art",
  "rich tapestry",
  "paradigm",
  "game-changer",
  "thought leader",
  "strategically positioned",
];

/** Polished connective transitions that LLM text over-uses. */
const AI_TRANSITIONS: readonly string[] = [
  "moreover,",
  "furthermore,",
  "additionally,",
  "consequently,",
  "notably,",
  "in conclusion,",
  "overall,",
  "significantly,",
];

/** Sentence splitter tolerant of bullets and fragments. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Count "x, y, and z" / "x, y, z" triples inside a sentence. */
function ruleOfThreeHits(sentence: string): number {
  const matches = sentence.match(
    /\b\w[\w-]*,\s+\w[\w-]*(?:,\s+and\s+\w[\w-]*|\b\s+and\s+\w[\w-]*)/g,
  );
  return matches ? matches.length : 0;
}

/** Normalized em-dash / semicolon density per 100 words. */
function punctuationDensity(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const marks = (text.match(/[—–;]| --/g) ?? []).length;
  return (marks / words) * 100;
}

/** Fraction of sentences whose word counts sit within ±2 of the mode —
 * uniform rhythm is a weak LLM tell only when there are enough sentences. */
function rhythmUniformity(sentences: string[]): number {
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  if (lengths.length < 4) return 0;
  const counts = new Map<number, number>();
  for (const len of lengths) counts.set(len, (counts.get(len) ?? 0) + 1);
  const mode = Math.max(...counts.values());
  const nearMode = lengths.filter((len) => Math.abs(len - (mode ?? 0)) <= 2).length;
  return nearMode / lengths.length;
}

/**
 * Analyze resume text for AI-typical patterns. Pure function; same text
 * in, same report out. `signals` is capped to keep the UI readable.
 */
export function detectAiContent(text: string): AiContentReport {
  const sentences = sentencesOf(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Too little text to judge honestly (bullet-only resumes, header stubs).
  if (wordCount < 60 || sentences.length < 3) {
    return {
      level: "insufficient_text",
      score: null,
      signals: [],
      summary: "Not enough prose to evaluate — add a short summary or project notes for a reading.",
    };
  }

  const signals: AiContentSignal[] = [];
  let phraseHits = 0;
  let transitionHits = 0;
  let tripleHits = 0;
  const lower = text.toLowerCase();

  for (const phrase of AI_PHRASES) {
    const hits = lower.split(phrase).length - 1;
    phraseHits += hits;
    if (hits > 0 && signals.length < 12) {
      const sentence = sentences.find((s) => s.toLowerCase().includes(phrase));
      if (sentence) signals.push({ text: sentence.slice(0, 240), signal: "phrase" });
    }
  }

  for (const t of AI_TRANSITIONS) {
    transitionHits += lower.split(t).length - 1;
  }

  for (const s of sentences) {
    tripleHits += ruleOfThreeHits(s);
    if (tripleHits >= 2 && signals.length < 12) {
      signals.push({ text: s.slice(0, 240), signal: "rule_of_three" });
    }
  }

  const emDash = punctuationDensity(text);
  const rhythm = rhythmUniformity(sentences);
  if (rhythm >= 0.75) {
    const sample = sentences[0];
    if (sample) signals.push({ text: sample.slice(0, 240), signal: "rhythm" });
  }

  // Composite: each signal class contributes a bounded weight; strong
  // rhythm / punctuation only nudge, they never dominate.
  const raw =
    Math.min(phraseHits, 8) * 9 + // phrases are the strongest tell
    Math.min(transitionHits, 5) * 4 +
    Math.min(tripleHits, 4) * 5 +
    Math.min(emDash, 3) * 4 +
    (rhythm >= 0.75 ? 10 : 0);
  const score = Math.min(100, Math.round(raw));

  const level: AiSuspicion = score >= 55 ? "notable" : score >= 30 ? "moderate" : "low";

  const summary =
    level === "notable"
      ? "Several AI-typical patterns found — worth probing specific claims in the interview."
      : level === "moderate"
        ? "Some AI-typical phrasing — a light interview probe may be worthwhile."
        : "Reads like naturally written resume text — no meaningful pattern detected.";

  return { level, score, signals: signals.slice(0, 10), summary };
}
