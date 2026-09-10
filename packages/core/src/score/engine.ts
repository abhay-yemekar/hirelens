/**
 * Deterministic scoring engine: rubric + candidate resume text → per-
 * criterion scores with evidence spans, via the structured-output LLM
 * layer. Every artifact needed for audit (prompt hash, model id, spans,
 * consistency flag) is produced here so callers can persist a complete,
 * defensible scoring run.
 */

import { z } from "zod";
import type { TextSpan } from "../evidence/textSpan.js";
import { locateEvidenceSpan } from "../evidence/textSpan.js";
import { type LanguageModel, modelIdOf } from "../llm/config.js";
import { generateStructured } from "../llm/generate.js";
import { promptHash } from "../llm/promptHash.js";
import type { Rubric } from "../rubric/schema.js";
import type { CriterionScore } from "./weighting.js";
import { weightedOverall } from "./weighting.js";

/** Hard cap on resume text sent to the model; longer docs are truncated. */
export const MAX_RESUME_CHARS = 60_000;

/** Spans quoted by the model are bounded; runaway quotes get clamped. */
const MAX_QUOTE_CHARS = 400;

const SYSTEM = `You are an expert technical recruiter scoring a resume against a screening rubric.
For each criterion:
- Read the anchored 0-5 scale and pick the level the resume's evidence supports.
- quote an exact, verbatim span from the resume that justifies the score (the strongest single passage).
- Write a one-to-two-sentence rationale referencing the anchored level's description.
- Set confidence between 0 and 1 reflecting how directly the evidence matches the criterion.
Rules:
- Assess only demonstrated skills and experience stated in the resume.
- Honor the rubric's exclusions and each criterion's doNotUse list: bar-proxy factors (age, name, school prestige, address, photo) must not move any score.
- If a criterion has no supporting evidence, score it 0 with high confidence and quote nothing (empty quote).`;

const SpanSchema = z.object({ score: z.number().int().min(0).max(5) });

const ScoredSchema = z.object({
  criteria: z
    .array(
      z.object({
        key: z.string().min(1),
        score: z.number().int().min(0).max(5),
        confidence: z.number().min(0).max(1),
        rationale: z.string().min(1),
        quote: z.string().default(""),
      }),
    )
    .min(1),
});

export interface ScoredCriterion extends CriterionScore {
  /** Verbatim evidence span from the resume; null when no quote applies. */
  evidence: TextSpan | null;
}

export interface ScoreRunResult {
  criteria: ScoredCriterion[];
  /** Weighted overall, 0-100. */
  overall: number;
  /** Determinism/audit record: hash over system, prompt, schema, sampling, model. */
  promptHash: string;
  modelId: string;
  /** True when the schema repair round fired. */
  repaired: boolean;
  /** Consistency-guard flag: low-confidence spread across criteria. */
  needsAdjudication: boolean;
}

export interface ScoreRunOptions {
  seed?: number;
  temperature?: number;
  /**
   * Consistency guard threshold: if more than this fraction of criteria
   * score below this confidence, the run is flagged for a second-model
   * adjudication pass downstream.
   */
  adjudicateBelowConfidence?: number;
}

/**
 * Score one resume against a rubric. Deterministic by default
 * (temperature 0). Evidence quotes are located in the document text;
 * unmatched or empty quotes yield null evidence rather than fabricating
 * offsets.
 */
export async function scoreResume(
  model: LanguageModel,
  rubric: Rubric,
  resumeText: string,
  opts: ScoreRunOptions = {},
): Promise<ScoreRunResult> {
  const trimmed =
    resumeText.length > MAX_RESUME_CHARS ? `${resumeText.slice(0, MAX_RESUME_CHARS)}…` : resumeText;
  const rubricJson = JSON.stringify(rubric);
  const prompt = `Rubric (version ${rubric.version}):\n${rubricJson}\n\nResume:\n${trimmed}`;
  const hash = promptHash({
    system: SYSTEM,
    prompt,
    schemaId: "scoring.run.v1",
    temperature: opts.temperature ?? 0,
    seed: opts.seed,
    modelId: modelIdOf(model),
  });

  const { object, attempts } = await generateStructured(
    model,
    {
      system: SYSTEM,
      prompt,
      temperature: opts.temperature ?? 0,
      ...(opts.seed === undefined ? {} : { seed: opts.seed }),
    },
    ScoredSchema,
  );

  const byKey = new Map(object.criteria.map((c) => [c.key, c]));
  const criteria: ScoredCriterion[] = [];
  for (const c of rubric.criteria) {
    const s = byKey.get(c.key);
    if (!s) {
      // Missing criterion: score 0 with explicit note — never silently skip.
      criteria.push({
        key: c.key,
        score: 0,
        confidence: 0,
        rationale: "No score returned for this criterion.",
        evidence: null,
      });
      continue;
    }
    const quote = s.quote.slice(0, MAX_QUOTE_CHARS);
    const evidence = quote.length > 0 ? locateEvidenceSpan(trimmed, quote) : null;
    criteria.push({
      key: c.key,
      score: SpanSchema.parse({ score: s.score }).score,
      confidence: s.confidence,
      rationale: s.rationale,
      evidence,
    });
  }

  const lowConfidence = criteria.filter(
    (c) => c.confidence < (opts.adjudicateBelowConfidence ?? 0.5),
  ).length;
  return {
    criteria,
    overall: weightedOverall(rubric.criteria, criteria),
    promptHash: hash,
    modelId: modelIdOf(model),
    repaired: attempts > 1,
    needsAdjudication: lowConfidence * 2 > criteria.length,
  };
}
