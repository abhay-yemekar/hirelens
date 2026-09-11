/**
 * Offline eval run against the deterministic mock model. Produces the
 * same report JSON as the live runner — useful for CI and for validating
 * the harness itself without API keys.
 */

import { createMockModel } from "@hirelens/core";
import { runEvals } from "./harness.js";

const CRITERIA = ["system-design", "databases", "testing", "ops", "communication"];

async function main(): Promise<void> {
  // The mock returns constant scores; per-resume variation comes from the
  // benchmark text only if the model reacts to it — document this limit in
  // the printed report (mock numbers validate plumbing, not quality).
  const { model } = createMockModel({
    args: {
      criteria: CRITERIA.map((key) => ({
        key,
        score: 3,
        confidence: 0.9,
        rationale: "mock benchmark run",
        quote: "",
      })),
    },
  });

  const report = await runEvals(model, { repeats: 3 });
  console.log(JSON.stringify(report, null, 2));

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    new URL("../../eval-report.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.error("Wrote eval-report.json (mock model — plumbing check, not a quality signal)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
