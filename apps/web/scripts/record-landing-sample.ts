/**
 * Records the landing page's product-shot sample: every fictional demo
 * resume scored by a real model through the product's scoring engine
 * (`scoreResume`). The page derives each number it shows from this
 * recording at render time (src/lib/landing-sample.ts), so the shots can
 * never drift from what the engine produces.
 *
 *   HIRELENS_LLM_PROVIDER=groq HIRELENS_LLM_MODEL=openai/gpt-oss-120b \
 *   HIRELENS_LLM_API_KEY=... pnpm --filter @hirelens/web run landing-sample
 *
 * Build @hirelens/core first: this imports its dist.
 */

import { writeFileSync } from "node:fs";
import { type LlmProviderId, resolveLanguageModel, scoreResume } from "@hirelens/core";
import { DEMO_RESUMES, DEMO_RUBRIC } from "../src/lib/demo-data";

/** Free-tier providers allow a few requests per minute. */
const PACING_MS = 8000;

async function main(): Promise<void> {
  const provider = process.env["HIRELENS_LLM_PROVIDER"];
  const model = process.env["HIRELENS_LLM_MODEL"];
  const apiKey = process.env["HIRELENS_LLM_API_KEY"];
  if (!provider || !model) {
    console.error("Set HIRELENS_LLM_PROVIDER + HIRELENS_LLM_MODEL (+ HIRELENS_LLM_API_KEY).");
    process.exit(2);
  }
  const llm = resolveLanguageModel({
    id: provider as LlmProviderId,
    model,
    ...(apiKey ? { apiKey } : {}),
  });

  const candidates = [];
  for (const [i, resume] of DEMO_RESUMES.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PACING_MS));
    console.error(`Scoring ${resume.id} (${i + 1}/${DEMO_RESUMES.length})…`);
    const run = await scoreResume(llm, DEMO_RUBRIC, resume.text);
    candidates.push({
      id: resume.id,
      overall: run.overall,
      needsAdjudication: run.needsAdjudication,
      criteria: run.criteria.map((c) => ({
        key: c.key,
        score: c.score,
        confidence: c.confidence,
        evidence: c.evidence,
      })),
    });
  }

  const recording = {
    date: new Date().toISOString().slice(0, 10),
    provider,
    model,
    rubricVersion: DEMO_RUBRIC.version,
    candidates,
  };
  const out = new URL("../src/lib/landing-sample.json", import.meta.url);
  writeFileSync(out, `${JSON.stringify(recording, null, 2)}\n`);
  console.error("Wrote src/lib/landing-sample.json");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
