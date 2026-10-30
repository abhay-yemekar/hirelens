/**
 * The landing page's product-shot sample, derived at render time from a
 * recorded real-model run (landing-sample.json, written by
 * scripts/record-landing-sample.ts). Overall scores, evidence spans and the
 * bias audit all come from the product's engine, so the shots cannot show
 * a number the engine would not produce. Stages and self-reported gender
 * are synthetic recruiter inputs, like a real job's decisions.
 */

import {
  type BiasAudit,
  biasAudit,
  type GroupOutcome,
  type LlmProviderId,
  PROVIDER_LABELS,
  type TextSpan,
  weightedOverall,
} from "@hirelens/core";
import { DEMO_RESUMES, DEMO_RUBRIC } from "./demo-data";
import recording from "./landing-sample.json";

export type Stage = "advanced" | "shortlisted" | "new" | "rejected";
export type Gender = "woman" | "man" | "undisclosed";

/**
 * Synthetic recruiter decisions and self-reported gender. Olivia Brown
 * ranks third but was rejected while lower-ranked men were shortlisted:
 * the pattern the adverse-impact audit exists to catch.
 */
export const DECISIONS: Readonly<Record<string, { stage: Stage; gender: Gender }>> = {
  "marcus-lee": { stage: "advanced", gender: "man" },
  "jordan-avery": { stage: "shortlisted", gender: "undisclosed" },
  "olivia-brown": { stage: "rejected", gender: "woman" },
  "sophia-nguyen": { stage: "shortlisted", gender: "woman" },
  "amelia-carter": { stage: "rejected", gender: "woman" },
  "priya-sharma": { stage: "shortlisted", gender: "woman" },
  "ethan-patel": { stage: "shortlisted", gender: "man" },
  "noah-williams": { stage: "shortlisted", gender: "man" },
  "david-okafor": { stage: "rejected", gender: "man" },
  "emily-chen": { stage: "rejected", gender: "woman" },
  "liam-murphy": { stage: "rejected", gender: "man" },
  "isabella-rossi": { stage: "new", gender: "woman" },
};

/** Stages the audit counts as selected (the bias API's default). */
const SELECTED_STAGES: ReadonlySet<Stage> = new Set(["shortlisted", "advanced"]);

const GROUP_LABELS: Readonly<Record<Gender, string>> = {
  woman: "Women",
  man: "Men",
  undisclosed: "Undisclosed",
};

export interface SampleCriterion {
  key: string;
  title: string;
  weight: number;
  score: number;
  evidence: TextSpan | null;
}

export interface SampleCandidate {
  id: string;
  name: string;
  role: string;
  text: string;
  overall: number;
  stage: Stage;
  gender: Gender;
  criteria: SampleCriterion[];
}

const resumes = new Map(DEMO_RESUMES.map((r) => [r.id, r]));

/** Every recorded candidate, best overall first (ties by name). */
export const SAMPLE_CANDIDATES: readonly SampleCandidate[] = recording.candidates
  .map((rec): SampleCandidate => {
    const resume = resumes.get(rec.id);
    const decision = DECISIONS[rec.id];
    if (!resume || !decision) throw new Error(`landing sample: no demo data for ${rec.id}`);
    const criteria = DEMO_RUBRIC.criteria.map((c) => {
      const scored = rec.criteria.find((s) => s.key === c.key);
      return {
        key: c.key,
        title: c.title,
        weight: c.weight,
        score: scored?.score ?? 0,
        evidence: scored?.evidence ?? null,
      };
    });
    const overall = weightedOverall(
      DEMO_RUBRIC.criteria,
      criteria.map((c) => ({ key: c.key, score: c.score, confidence: 1, rationale: "" })),
    );
    return { ...resume, ...decision, criteria, overall };
  })
  .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));

/** Where the scores came from, for the shots' captions. */
export const SAMPLE_RUN = {
  provider: PROVIDER_LABELS[recording.provider as LlmProviderId] ?? recording.provider,
  model: recording.model.split("/").pop() ?? recording.model,
  date: recording.date,
  rubricVersion: recording.rubricVersion,
};

/**
 * The criteria to show for a candidate: highest weighted score first, each
 * with its own evidence passage (a quote backing two criteria shows once).
 */
export function topCriteria(candidate: SampleCandidate, count: number): SampleCriterion[] {
  const shown: SampleCriterion[] = [];
  const quotes = new Set<number>();
  const ranked = candidate.criteria
    .filter((c) => c.evidence !== null && c.score > 0)
    .sort((a, b) => b.score * b.weight - a.score * a.weight);
  for (const c of ranked) {
    const start = c.evidence?.startOffset ?? -1;
    if (quotes.has(start)) continue;
    quotes.add(start);
    shown.push(c);
    if (shown.length === count) break;
  }
  return shown;
}

/**
 * The resume lines around a span, split so the span can be highlighted:
 * the line before it, its own line(s), and the line after.
 */
export function excerptAround(
  text: string,
  span: TextSpan,
): { before: string; marked: string; after: string } {
  const lineStart = (i: number) => text.lastIndexOf("\n", i - 1) + 1;
  const lineEnd = (i: number) => {
    const end = text.indexOf("\n", i);
    return end === -1 ? text.length : end;
  };
  const from = span.startOffset > 0 ? lineStart(lineStart(span.startOffset) - 1) : 0;
  const to = lineEnd(lineEnd(span.endOffset) + 1);
  return {
    before: text.slice(from, span.startOffset),
    marked: text.slice(span.startOffset, span.endOffset),
    after: text.slice(span.endOffset, to),
  };
}

const outcomes: GroupOutcome[] = (Object.keys(GROUP_LABELS) as Gender[]).map((gender) => {
  const group = SAMPLE_CANDIDATES.filter((c) => c.gender === gender);
  return {
    group: gender,
    considered: group.length,
    selected: group.filter((c) => SELECTED_STAGES.has(c.stage)).length,
  };
});

/** The bias audit of the synthetic decisions, by self-reported gender. */
export const SAMPLE_AUDIT: BiasAudit = biasAudit(outcomes);

export function groupLabel(group: string): string {
  return GROUP_LABELS[group as Gender] ?? group;
}
