/**
 * Live-model eval entry point. Gated on LLM env vars; prints the report
 * and writes it to reports/<date>-<provider>-<model>.json with provenance.
 * packages/eval-report.json stays the offline mock run (evals:mock).
 *
 *   pnpm --filter @candidlens/evals run evals          # with CANDIDLENS_LLM_* set
 *   pnpm --filter @candidlens/evals run evals:mock     # offline, mock model
 */

import { readSetting, resolveLanguageModel } from "@candidlens/core";
import { runEvals } from "./harness.js";

async function main(): Promise<void> {
  const provider = readSetting("LLM_PROVIDER");
  const model = readSetting("LLM_MODEL");
  const apiKey = readSetting("LLM_API_KEY");
  const baseUrl = readSetting("LLM_BASE_URL");

  if (!provider || !model) {
    console.error(
      "Set CANDIDLENS_LLM_PROVIDER + CANDIDLENS_LLM_MODEL (+ CANDIDLENS_LLM_API_KEY) to run live evals.",
    );
    process.exit(2);
  }

  const llm = resolveLanguageModel({
    id: provider as "google" | "anthropic" | "groq" | "openrouter" | "ollama",
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

  console.error(`Running evals against ${provider}/${model}…`);
  // ~30 scoring calls; pacing respects free-tier RPM. On quota exhaustion
  // the run fails with a clear message — partial numbers would be spin.
  const report = await runEvals(llm, { repeats: 3, pacingMs: 8000 }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("quota") || msg.includes("429")) {
      console.error(
        "Provider quota exhausted (the free tier is ~20 req/min and a small daily cap).\n" +
          "Run `pnpm --filter @candidlens/evals run evals` with a billing-enabled key,\n" +
          "or use `pnpm --filter @candidlens/evals run evals:mock` for an offline plumbing check.",
      );
      process.exit(3);
    }
    throw err;
  });

  console.log(JSON.stringify(report, null, 2));

  const { mkdirSync, writeFileSync } = await import("node:fs");
  const date = new Date().toISOString().slice(0, 10);
  const slug = `${provider}-${model}`.replace(/[^a-z0-9.-]+/gi, "-");
  const dir = new URL("../reports/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    new URL(`${date}-${slug}.json`, dir),
    `${JSON.stringify({ date, provider, model, ...report }, null, 2)}\n`,
  );
  console.error(`Wrote reports/${date}-${slug}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
