/**
 * Live-model eval entry point. Gated on LLM env vars; prints the report
 * and optionally writes eval-report.json for the README pipeline.
 *
 *   pnpm --filter @hirelens/evals run evals          # with HIRELENS_LLM_* set
 *   pnpm --filter @hirelens/evals run evals:mock     # offline, mock model
 */

import { resolveLanguageModel } from "@hirelens/core";
import { runEvals } from "./harness.js";

async function main(): Promise<void> {
  const provider = process.env["HIRELENS_LLM_PROVIDER"];
  const model = process.env["HIRELENS_LLM_MODEL"];
  const apiKey = process.env["HIRELENS_LLM_API_KEY"];
  const baseUrl = process.env["HIRELENS_LLM_BASE_URL"];

  if (!provider || !model) {
    console.error(
      "Set HIRELENS_LLM_PROVIDER + HIRELENS_LLM_MODEL (+ HIRELENS_LLM_API_KEY) to run live evals.",
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
          "Run `pnpm --filter @hirelens/evals run evals` with a billing-enabled key,\n" +
          "or use `pnpm --filter @hirelens/evals run evals:mock` for an offline plumbing check.",
      );
      process.exit(3);
    }
    throw err;
  });

  console.log(JSON.stringify(report, null, 2));

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    new URL("../../eval-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.error("Wrote eval-report.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
