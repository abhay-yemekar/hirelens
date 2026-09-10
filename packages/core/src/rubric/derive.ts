/**
 * JD → rubric derivation. The LLM proposes criteria; this module owns the
 * shape: slugged keys, exactly six anchored levels, bar-proxy exclusions,
 * and RubricSchema validation before anything escapes.
 */
import { z } from "zod";
import { type LanguageModel, modelIdOf } from "../llm/config.js";
import { generateStructured } from "../llm/generate.js";
import { promptHash } from "../llm/promptHash.js";
import type { Rubric } from "./schema.js";
import { RubricSchema } from "./schema.js";

/** Hard cap on JD text sent to the model; longer JDs are truncated. */
export const MAX_JD_CHARS = 12_000;

const SYSTEM = `You are a senior technical recruiter designing a screening rubric.
From the job description, derive 5 to 8 weighted, job-relevant criteria.
Rules:
- Each criterion gets a 0-5 anchored scale; every level description must state what the RESUME must show.
- Weights are relative importance (any positive numbers; they get normalized).
- Assess the candidate's demonstrated skills and experience only.
- Never assess protected or proxy characteristics (age, gender, name, schools-as-status, accent, photo, address). List anything the JD implies that must be excluded in "exclusions", and per-criterion traps in "doNotUse".
- key is a short slug (lowercase-kebab). title is a human label.`;

const LevelsSchema = z.tuple([
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
  z.object({ label: z.string().min(1), description: z.string().min(1) }),
]);

const ProposalSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  weight: z.number().positive(),
  scale: LevelsSchema,
  doNotUse: z.array(z.string()).default([]),
});

const DerivationSchema = z.object({
  title: z.string().min(1).max(200),
  criteria: z.array(ProposalSchema).min(5).max(8),
  exclusions: z.array(z.string()).default([]),
});

export interface DerivationAudit {
  /** Deterministic hash over system, JD, schema id, sampling params. */
  promptHash: string;
  modelId: string;
  /** Whether the schema repair round was needed. */
  repaired: boolean;
}

export interface DerivationResult {
  rubric: Rubric;
  audit: DerivationAudit;
}

/** Slugify a criterion title into a stable kebab-case key. */
export function slugifyKey(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "criterion";
}

/** Ensure unique, slug-stable criterion keys within one rubric. */
function uniquifyKeys(
  criteria: Array<{ title: string; key?: string } & Record<string, unknown>>,
): void {
  const seen = new Map<string, number>();
  for (const c of criteria) {
    const base = c.key && c.key.length > 0 ? slugifyKey(c.key) : slugifyKey(c.title);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    c.key = n === 0 ? base : `${base}-${n + 1}`;
  }
}

/**
 * Derive a versioned rubric from a job description. The rubric passes
 * RubricSchema (5-8 criteria, six anchored levels each) or the call throws.
 */
export async function deriveRubric(
  model: LanguageModel,
  jd: string,
  opts: { seed?: number; temperature?: number } = {},
): Promise<DerivationResult> {
  const trimmed = jd.length > MAX_JD_CHARS ? `${jd.slice(0, MAX_JD_CHARS)}…` : jd;
  const prompt = `Job description:\n\n${trimmed}`;
  const hash = promptHash({
    system: SYSTEM,
    prompt,
    schemaId: "rubric.derivation.v1",
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
    DerivationSchema,
  );

  uniquifyKeys(object.criteria);
  const parsed = RubricSchema.safeParse({
    version: 1,
    key: slugifyKey(object.title),
    title: object.title,
    criteria: object.criteria,
    exclusions: object.exclusions,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Derivation produced an invalid rubric: ${issue?.path.join(".") ?? "(root)"} ${issue?.message ?? ""}`,
    );
  }
  return {
    rubric: parsed.data,
    audit: { promptHash: hash, modelId: modelIdOf(model), repaired: attempts > 1 },
  };
}
