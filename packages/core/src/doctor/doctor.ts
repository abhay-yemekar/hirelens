/**
 * Resume Doctor (phase 2 flagship, candidate-side): ~30 deterministic
 * checks against plain resume text — contact, structure, dates, impact
 * (verbs/metrics), brevity, parseability. No model, no I/O: same text
 * in, same report out, so the same resume always earns the same score
 * (Resume Worded's core promise, executed glass-box).
 *
 * Every finding carries a character span into the ORIGINAL text so the
 * UI can pin the flag to the exact line. Offsets are plain string
 * offsets of the raw text, so masking/blindView (length preserving)
 * never breaks alignment.
 *
 * Score: starts at 100, deterministic penalties subtract, floored at 0.
 * Bands (fixed thresholds, never curved): excellent ≥85, good ≥60,
 * needs_work <60. Nothing can inflate a bad resume; an excellent one
 * hits 100 without any model.
 *
 * Guardrails: "no dates", "no email", "no metrics" are structural
 * facts, never invented content. AI-content suspicion is informational
 * only and never mixed into the score.
 */

import { type AiSuspicion, detectAiContent } from "../parse/ai-content.js";
import { checkFormat } from "../parse/ats-format.js";
import { parseCandidate } from "../parse/candidate.js";
import { countDigits, findEmailToken } from "../parse/contact.js";
import { extractDateRange } from "../parse/dates.js";
import type { Candidate } from "../parse/schema.js";
import { segmentSections, splitInlineHeaders } from "../parse/sections.js";

export type Severity = "fail" | "warn" | "info";

/** Group of the resume the check inspects — matches the UI's filters. */
export type FindingCategory = "contact" | "structure" | "dates" | "impact" | "brevity" | "parse";

/** One flag with an actionable fix, pinned to a line when possible. */
export interface DoctorFinding {
  /** Stable machine key, e.g. "no-metrics", "first-person". */
  code: string;
  category: FindingCategory;
  severity: Severity;
  /** Short headline the UI shows bold, e.g. "No quantified results". */
  title: string;
  /** One or two sentences: what is wrong and how to fix it. */
  detail: string;
  /** Exact span of the offending line in the raw text (null when document-wide). */
  startOffset: number | null;
  endOffset: number | null;
  /** 1-based line number of the span (null when document-wide). */
  line: number | null;
  /** Points deducted from 100 (0 for informational). */
  penalty: number;
}

export interface DoctorReport {
  /** 0–100 deterministic quality score. */
  score: number;
  /** pass | caution | action_needed bands (fixed thresholds). */
  band: "excellent" | "good" | "needs_work";
  findings: DoctorFinding[];
  /** Headline next steps, derived from the highest-penalty findings. */
  nextSteps: string[];
  /** Suspected LLM-written lines (informational only). */
  aiContent: { level: AiSuspicion; lines: Array<{ text: string; signal: string }> } | null;
}

const BULLET_RE = /^[-*•▪·‣]\s*/;
const STRONG_VERB_RE =
  /^(led|built|designed|drove|shipped|launched|architected|migrated|cut|grew|reduced|increased|improved|automated|delivered|owned|scaled|rebuilt|refactored|created|established|implemented|ran|mentored|managed)\b/i;
const ACTION_META_RE =
  /^(responsible for|worked on|helped with|involved in|participated in|assisted (?:with|in)|duties included|tasked with|in charge of|handled)\b/i;
const FIRST_PERSON_RE = /(?:\b(?:I|me|my|mine|myself|we|our|us)\b)/g;

interface LineInfo {
  text: string;
  /** 1-based. */
  line: number;
  startOffset: number;
  endOffset: number;
}

function linesWithOffsets(text: string): LineInfo[] {
  const out: LineInfo[] = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    out.push({
      text: raw,
      line: out.length + 1,
      startOffset: offset,
      endOffset: offset + raw.length,
    });
    offset += raw.length + 1;
  }
  return out;
}

const PEN: Record<FindingCategory, { fail: number; warn: number; info: number }> = {
  contact: { fail: 8, warn: 4, info: 0 },
  structure: { fail: 7, warn: 3, info: 0 },
  dates: { fail: 6, warn: 3, info: 0 },
  impact: { fail: 9, warn: 4, info: 0 },
  brevity: { fail: 6, warn: 3, info: 0 },
  parse: { fail: 8, warn: 4, info: 0 },
};

function finding(
  code: string,
  category: FindingCategory,
  severity: Severity,
  title: string,
  detail: string,
  info: LineInfo | null,
): DoctorFinding {
  return {
    code,
    category,
    severity,
    title,
    detail,
    startOffset: info ? info.startOffset : null,
    endOffset: info ? info.endOffset : null,
    line: info ? info.line : null,
    penalty: PEN[category][severity],
  };
}

/**
 * Run the deterministic doctor over resume text.
 */
export function runResumeDoctor(text: string): DoctorReport {
  const findings: DoctorFinding[] = [];
  const rawLines = linesWithOffsets(text);
  const lines = rawLines.map((l) => ({ ...l, trimmed: l.text.trim() }));
  const nonEmpty = lines.filter((l) => l.trimmed.length > 0);

  let parsed: Candidate | null = null;
  try {
    parsed = parseCandidate(text);
  } catch {
    parsed = null;
  }

  const sections = segmentSections(splitInlineHeaders(text.split("\n")));
  const section = (needle: string) => [...sections.values()].find((s) => s.key === needle);

  // ── contact ─────────────────────────────────────────────────────────
  if (parsed?.name == null) {
    findings.push(
      finding(
        "no-name",
        "contact",
        "fail",
        "No name detected",
        "Put your full name alone on the first line — parsers use it to link the document to you.",
        lines[0] ?? null,
      ),
    );
  }
  if (parsed?.email == null) {
    const first = nonEmpty[0] ?? null;
    findings.push(
      finding(
        "no-email",
        "contact",
        "fail",
        "No email address",
        "Add a plain-text email in the header block. Images or styled contact rows do not survive parsing.",
        first,
      ),
    );
  }
  if (parsed?.phone == null) {
    findings.push(
      finding(
        "no-phone",
        "contact",
        "warn",
        "No phone number",
        "Some recruiters expect a phone. If you deliberately omitted it, ignore this flag.",
        null,
      ),
    );
  }
  const headerEmails = lines
    .slice(0, Math.min(3, lines.length))
    .filter((l) => findEmailToken(l.text));
  if (headerEmails.length > 1) {
    findings.push(
      finding(
        "multiple-emails",
        "contact",
        "info",
        "More than one email",
        "Pick one clean email so the parser knows which one is real.",
        headerEmails[headerEmails.length - 1] ?? null,
      ),
    );
  }

  // ── structure ───────────────────────────────────────────────────────
  const hasExperience = section("experience") !== undefined;
  const hasEducation = section("education") !== undefined;
  const hasSkills = section("skills") !== undefined;
  const missing: string[] = [];
  if (!hasExperience) missing.push("Experience");
  if (!hasEducation) missing.push("Education");
  if (!hasSkills) missing.push("Skills");
  if (missing.length > 0) {
    findings.push(
      finding(
        "missing-sections",
        "structure",
        missing.length >= 2 ? "fail" : "warn",
        `Missing standard section${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        "ATS parsers segment by standard headings first — custom ones get skipped or miscategorized.",
        null,
      ),
    );
  }

  // ── dates ───────────────────────────────────────────────────────────
  const exp = section("experience");
  const dateRanges: Array<{
    info: LineInfo;
    range: NonNullable<ReturnType<typeof extractDateRange>>;
  }> = [];
  if (exp) {
    for (let i = exp.start + 1; i < exp.end; i++) {
      const info = lines[i];
      if (!info) continue;
      const range = extractDateRange(info.text);
      if (range) dateRanges.push({ info, range });
    }
  }
  if (exp && dateRanges.length === 0) {
    findings.push(
      finding(
        "no-dates",
        "dates",
        "fail",
        "No employment dates",
        "Each role needs at least a start year (or MM/YYYY) so the ATS can compute tenure. Add them next to each job header.",
        null,
      ),
    );
  }

  const thisYear = new Date().getFullYear();
  for (const { info, range } of dateRanges) {
    const sm = /^(\d{4})/.exec(range.start);
    const em = /(\d{4})\s*$/.exec(range.end);
    if (sm && em && Number(sm[1]) > Number(em[1])) {
      findings.push(
        finding(
          "date-order",
          "dates",
          "warn",
          "Date range out of order",
          `This range ends (${em[1]}) before it starts (${sm[1]}) — a typo recruiters read as an error, not a mystery.`,
          info,
        ),
      );
    }
    if (em && Number(em[1]) > thisYear + 1) {
      findings.push(
        finding(
          "future-date",
          "dates",
          "warn",
          "Future end date",
          `An end year of ${em[1]} looks pre-written or mistyped.`,
          info,
        ),
      );
    }
  }

  // ── impact ──────────────────────────────────────────────────────────
  const bulletInfos = lines.filter((l) => BULLET_RE.test(l.trimmed));
  const bullets = bulletInfos.map((l) => ({
    info: l,
    content: l.trimmed.replace(BULLET_RE, "").trim(),
  }));

  if (bullets.length >= 3) {
    const withMetric = bullets.filter((b) => countDigits(b.content) > 0);
    const metricRatio = withMetric.length / bullets.length;
    if (metricRatio < 0.25) {
      findings.push(
        finding(
          "no-metrics",
          "impact",
          "fail",
          "No quantified results",
          "Numbers are the fastest credibility signal (%, $, counts, time saved). Put one in at least a quarter of your bullets. Only write what is true — never invent a number.",
          bullets[0]?.info ?? null,
        ),
      );
    } else if (metricRatio < 0.45) {
      const firstMissing = bullets.find((b) => countDigits(b.content) === 0);
      findings.push(
        finding(
          "few-metrics",
          "impact",
          "warn",
          "Few quantified results",
          'Aim for numbers in ~half your bullets — show scale, speed, or money where it exists. Only what is true: if a number is missing, ask "how many?" rather than inventing one.',
          firstMissing?.info ?? null,
        ),
      );
    }

    const weak = bullets.filter(
      (b) => !STRONG_VERB_RE.test(b.content) || ACTION_META_RE.test(b.content),
    );
    if (weak.length / bullets.length > 0.6) {
      findings.push(
        finding(
          "weak-verbs",
          "impact",
          "warn",
          "Weak verbs",
          'Start bullets with concrete verbs ("Led", "Built", "Cut"). "Responsible for" is a job-description phrase, not a result.',
          weak[0]?.info ?? null,
        ),
      );
    }

    for (const b of bullets) {
      const live = (b.content.match(FIRST_PERSON_RE) ?? []).slice(0, 3);
      if (live.length >= 2) {
        findings.push(
          finding(
            "first-person",
            "impact",
            "warn",
            "First-person pronoun",
            'Resume prose usually starts with the verb ("Built the pipeline"), not "I built...".',
            b.info,
          ),
        );
        break;
      }
    }
  }

  // ── brevity ─────────────────────────────────────────────────────────
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 800) {
    findings.push(
      finding(
        "too-long",
        "brevity",
        "warn",
        "Resume is dense",
        "Over ~800 words usually means 2+ pages. Trim roles older than ~10 years to 1–2 lines each.",
        null,
      ),
    );
  }
  const longBullet = bullets.find((b) => b.content.split(/\s+/).length > 40);
  if (longBullet) {
    findings.push(
      finding(
        "long-bullet",
        "brevity",
        "info",
        "Very long bullet",
        "Aim for 1–2 lines each. If it won't fit, split it into two bullets.",
        longBullet.info,
      ),
    );
  }

  // ── parse/format (delegate checks the ATS module already has) ──────
  const fmt = checkFormat(text);
  for (const f of fmt.findings.slice(0, 6)) {
    if (f.code === "no-email" || f.code === "no-phone") continue; // reported above
    findings.push({
      code: `fmt-${f.code}`,
      category: "parse",
      severity: "warn",
      title: f.label,
      detail: f.detail,
      startOffset: null,
      endOffset: null,
      line: null,
      penalty: f.code === "unparseable" || f.code === "no-text" ? PEN.parse.fail : PEN.parse.warn,
    });
  }

  // ── AI-content detection (informational, never in the score) ───────
  const ai = detectAiContent(text);
  const aiContent =
    ai.level === "insufficient_text"
      ? null
      : {
          level: ai.level,
          lines: ai.signals.slice(0, 5).map((s) => ({ text: s.text, signal: s.signal })),
        };

  // ── score ───────────────────────────────────────────────────────────
  const penalty = findings.reduce((sum, f) => sum + f.penalty, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  // Honest bands (review ask): a numeric score alone lets "many small
  // warnings" hide "two hard failures" — a resume with no email AND no
  // dates must not present as "good" just because deductions didn't
  // sum past a threshold. Zero fails required for excellent; 2+ fails
  // cap the band at needs_work regardless of the number.
  const failCount = findings.filter((f) => f.severity === "fail").length;
  const band =
    failCount === 0 && score >= 85
      ? "excellent"
      : failCount >= 2 || score < 60
        ? "needs_work"
        : "good";

  const rank = { fail: 0, warn: 1, info: 2 } as const;
  const ordered = [...findings].sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.penalty - a.penalty,
  );
  const nextSteps = ordered.slice(0, 6).map((f) => f.title);

  return {
    score,
    band,
    findings,
    nextSteps,
    aiContent,
  };
}

/** Minimum non-whitespace length for the doctor to give a real report. */
export function isDoctorInputEnough(text: string): boolean {
  return text.replace(/\s/g, "").length >= 120;
}
