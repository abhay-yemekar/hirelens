/**
 * ATS format check (v1.4 milestone 3) — deterministic parse-simulation.
 *
 * Before a resume is scored, ask the question an ATS asks: "when a
 * downstream parser reads this document, what will go wrong?" Pure text in,
 * verdict + findings out; no model, no I/O. Same text in, same report out.
 *
 * Checks fall into four groups the roadmap called out:
 *  - text layer: no extractable text (scanned/image-only pages)
 *  - layout: multi-column / table artifacts (very short lines, pipe-column
 *    rows, columns of digits), low text density
 *  - encoding: mojibake sequences from double-encoded UTF-8 / odd encodings
 *  - structure: missing standard section headers, contact info not found
 */

import type { ExtractedDocument } from "../extract/types.js";
import { parseCandidate } from "./candidate.js";
import type { Candidate } from "./schema.js";
import { segmentSections } from "./sections.js";

/** A single parse hazard with an actionable fix. */
export interface FormatFinding {
  /** Machine-readable key: ats-format | low-text | table-layout | ... */
  code: string;
  /** Human headline, e.g. "Scanned or image-only pages". */
  label: string;
  /** What it breaks and how to fix it, one or two sentences. */
  detail: string;
}

export interface FormatCheck {
  /** pass | warn | fail — mirrors how the UI colors the verdict. */
  verdict: "pass" | "warn" | "fail";
  /** Numeric 0–100 parse-simulation score. */
  score: number;
  findings: FormatFinding[];
}

/** Mojibake signatures: typical mojibake glyphs of ①–③ no single one matches. */
const MOJIBAKE_RE = /[\u00C2\u00C3\u00E2][\u0080-\u00BF\u2013\u2014\u2018\u2019\u201C\u201D]/g;

export function checkFormat(text: string, extracted?: ExtractedDocument): FormatCheck {
  const findings: FormatFinding[] = [];
  const lines = text.split("\n").map((l) => l.trim());
  const nonEmpty = lines.filter((l) => l.length > 0);
  const chars = text.replace(/\s/g, "").length;

  // --- text layer ---------------------------------------------------------
  if (nonEmpty.length === 0 || chars === 0) {
    return {
      verdict: "fail",
      score: 0,
      findings: [
        {
          code: "no-text",
          label: "No extractable text",
          detail:
            "The document has no text layer (a scan or image-only export). Parsers read nothing — export a text-based PDF.",
        },
      ],
    };
  }

  if (extracted?.needsOcr) {
    findings.push({
      code: "needs-ocr",
      label: "Pages look scanned",
      detail:
        "One or more pages carry almost no text — likely images. Export a text-based PDF so parsers can read every page.",
    });
  } else if (extracted?.layoutHints.emptyPageIndices.length) {
    findings.push({
      code: "empty-pages",
      label: "Near-empty pages",
      detail:
        "Some pages contain almost no text. If they hold content, it is lost to parsers — re-export as text.",
    });
  }

  // --- layout -------------------------------------------------------------
  const emptyRatio = 1 - nonEmpty.length / Math.max(lines.length, 1);
  if (emptyRatio > 0.6) {
    findings.push({
      code: "fragmented-layout",
      label: "Fragmented text layout",
      detail:
        "Over 60% of lines are blank, a symptom of multi-column or table extraction. Content may be merged or shuffled — use a single-column layout.",
    });
  }
  const shortLines = nonEmpty.filter((l) => l.length <= 6).length;
  if (nonEmpty.length >= 20 && shortLines / nonEmpty.length > 0.35) {
    findings.push({
      code: "column-artifacts",
      label: "Column extraction artifacts",
      detail:
        "Many very short lines suggest multi-column or table content read as fragments. Keep work and education entries on single lines.",
    });
  }
  if (countTableRows(nonEmpty) >= 4) {
    findings.push({
      code: "table-layout",
      label: "Table-style layout",
      detail:
        "Multiple pipe-delimited rows indicate tables, which many parsers jumble. Prefer plain headings and lists.",
    });
  }
  const numericRows = nonEmpty.filter(
    (l) => l.length <= 20 && /^\d[\d.,\s%/-]*$/.test(l) && /\d/.test(l),
  ).length;
  if (nonEmpty.length >= 20 && numericRows / nonEmpty.length > 0.2) {
    findings.push({
      code: "numeric-columns",
      label: "Numeric column artifacts",
      detail:
        "Many standalone number fragments suggest spreadsheet columns exported as text. Content order will not survive parsing.",
    });
  }
  if (extracted?.layoutHints.lowTextDensity) {
    findings.push({
      code: "low-text",
      label: "Low text density",
      detail:
        "Very little text per page — the document may use images or decorative layouts. Keep the resume text-based.",
    });
  }

  // --- encoding -------------------------------------------------------------
  const bad = text.match(MOJIBAKE_RE);
  if (bad && bad.length >= 3) {
    findings.push({
      code: "encoding",
      label: "Encoding artifacts",
      detail:
        "Character sequences typical of double-encoded text (mojibake) were found. Some parsers read them as garbage — re-save as UTF-8.",
    });
  }

  // --- structure ------------------------------------------------------------
  // Rule of thumb from ATS lore: bullets separated from their line are fine,
  // but if EVERY bullet line is empty, bullets were images or text boxes.
  const bulletLines = nonEmpty.filter((l) => /^[-*\u2022\u25CF\u25AA\u00B7\u2219]/.test(l));
  const bulletWordy = bulletLines.filter(
    (l) => l.replace(/^[-*\u2022\u25CF\u25AA\u00B7\u2219]\s*/, "").split(/\s+/).length >= 3,
  ).length;
  if (bulletLines.length >= 5 && bulletWordy === 0) {
    findings.push({
      code: "bullet-ghosts",
      label: "Bullet points without text",
      detail:
        "Bullet glyphs appear alone on their lines — their text lives in text boxes or shapes and may be lost. Put bullet text inline.",
    });
  }

  let parsed: Candidate | null = null;
  try {
    parsed = parseCandidate(text);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    findings.push({
      code: "unparseable",
      label: "Nothing parseable",
      detail:
        "The parser could not find a name, contact, or experience data. Restructure with standard headings.",
    });
  } else {
    if (parsed.email === null) {
      findings.push({
        code: "no-email",
        label: "No email detected",
        detail: "Add a plain-text email address at the top of the resume.",
      });
    }
    if (parsed.phone === null) {
      findings.push({
        code: "no-phone",
        label: "No phone detected",
        detail: "Add a plain-text phone number in the header.",
      });
    }
    if (parsed.work.length === 0) {
      // A heading with no readable role under it is a different fix from
      // a missing heading, so say which one it is.
      const hasHeading = segmentSections(text.split("\n")).has("experience");
      findings.push(
        hasHeading
          ? {
              code: "unreadable-roles",
              label: "Couldn't read your roles",
              detail:
                'Your Experience heading was found, but no role under it could be read. Put each role on one line as "Title – Company – dates", e.g. "Software Engineer – Acme Corp – Mar 2021 – Present".',
            }
          : {
              code: "no-experience",
              label: "No experience section detected",
              detail: 'Add a heading named "Experience" with roles as "Title - Company - dates".',
            },
      );
    }
    if (parsed.skills.length === 0) {
      findings.push({
        code: "no-skills",
        label: "No skills section detected",
        detail: 'Add a "Skills" heading followed by a comma-separated list.',
      });
    }
  }

  // --- score ---------------------------------------------------------------
  // Deterministic weights; verdict from the worst finding group.
  const GROUP_WEIGHT: Record<string, number> = {
    "no-text": 100,
    "needs-ocr": 60,
    unparseable: 50,
    "no-experience": 20,
    "unreadable-roles": 20,
    "no-email": 10,
    "no-phone": 5,
    "no-skills": 5,
    "table-layout": 15,
    "fragmented-layout": 15,
    "column-artifacts": 12,
    "numeric-columns": 12,
    "empty-pages": 15,
    "low-text": 10,
    encoding: 8,
    "bullet-ghosts": 18,
  };
  let penalty = 0;
  for (const f of findings) penalty += GROUP_WEIGHT[f.code] ?? 10;
  const score = Math.max(0, 100 - penalty);

  const failing = findings.some((f) => (GROUP_WEIGHT[f.code] ?? 0) >= 50);
  const warning = findings.length > 0;
  const verdict: FormatCheck["verdict"] = failing ? "fail" : warning ? "warn" : "pass";

  return { verdict, score, findings };
}

/** "Languages: Go | Rust | C" — a labelled list, not a table row. */
const LABELLED_LIST_RE = /^[\p{L}][\p{L}\p{N} &/+.()-]{0,30}:\s/u;

/**
 * Count lines that look like rows of a real table. Pipes alone are not
 * enough: contact headers ("Title | City | site.com") and tech-stack lines
 * ("TypeScript | Next.js | Postgres") use them as separators, and parsers
 * read those fine. A line with 2+ pipes counts as a row when it is framed
 * by a pipe ("| a | b |", Markdown or ASCII tables) or sits in a run of 3+
 * consecutive such lines with the same number of cells. Labelled lists
 * never count.
 */
function countTableRows(lines: string[]): number {
  const cells = lines.map((l) => {
    const pipes = (l.match(/\|/g) ?? []).length;
    return pipes >= 2 && !LABELLED_LIST_RE.test(l) ? pipes + 1 : 0;
  });
  let rows = 0;
  let runStart = 0;
  for (let i = 1; i <= cells.length; i++) {
    if (i < cells.length && cells[i] === cells[runStart]) continue;
    // cells[runStart..i) is a run of lines with the same cell count.
    if ((cells[runStart] ?? 0) > 0) {
      const repeated = i - runStart >= 3;
      for (let k = runStart; k < i; k++) {
        const line = lines[k] ?? "";
        if (repeated || line.startsWith("|") || line.endsWith("|")) rows++;
      }
    }
    runStart = i;
  }
  return rows;
}
