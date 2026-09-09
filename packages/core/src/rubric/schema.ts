import { z } from "zod";

/** One anchored level of the 0-5 scale (index 0 = score 0). */
export interface AnchoredLevel {
  /** Short label, e.g. "Strong evidence". */
  label: string;
  /** What the resume must show to earn this level. */
  description: string;
}

/** A single weighted criterion with its anchored scale. */
export interface Criterion {
  /** Stable key, e.g. "backend-eng:system-design". */
  key: string;
  /** Human title, e.g. "System design". */
  title: string;
  /** Relative weight (any non-negative number). Sum-normalized before aggregation. */
  weight: number;
  /** Exactly six anchored levels: score 0 through score 5. */
  scale: [AnchoredLevel, AnchoredLevel, AnchoredLevel, AnchoredLevel, AnchoredLevel, AnchoredLevel];
  /** Bar-proxy factors the scorer must not use for this criterion. */
  doNotUse: string[];
}

/** Versioned rubric: 5-8 weighted criteria on an anchored 0-5 scale. */
export interface Rubric {
  /** Semantic version of the rubric artifact. */
  version: number;
  /** Stable rubric key, e.g. "backend-eng". */
  key: string;
  /** Human title, e.g. "Backend Engineer". */
  title: string;
  /** 5-8 weighted criteria. */
  criteria: Criterion[];
  /** Explicit bar-proxy exclusions for the whole rubric. */
  exclusions: string[];
}

export const AnchoredLevelSchema: z.ZodType<AnchoredLevel> = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
});

export const CriterionSchema: z.ZodType<Criterion> = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  weight: z.number().min(0),
  scale: z.tuple([
    AnchoredLevelSchema,
    AnchoredLevelSchema,
    AnchoredLevelSchema,
    AnchoredLevelSchema,
    AnchoredLevelSchema,
    AnchoredLevelSchema,
  ]),
  doNotUse: z.array(z.string()).default([]),
});

export const RubricSchema: z.ZodType<Rubric> = z.object({
  version: z.number().int().min(1),
  key: z.string().min(1),
  title: z.string().min(1),
  criteria: z.array(CriterionSchema).min(5).max(8),
  exclusions: z.array(z.string()).default([]),
});

/** Sum-normalize criterion weights so they add up to exactly 1. */
export function normalizeWeights(criteria: readonly Criterion[]): number[] {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) {
    return criteria.map(() => 1 / criteria.length);
  }
  return criteria.map((c) => c.weight / total);
}
