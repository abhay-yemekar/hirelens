import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import evalReport from "../../../../../packages/eval-report.json";

export const metadata: Metadata = {
  title: "Evaluation harness — HireLens",
  description:
    "An unevaluated ranker is a liability. HireLens measures direction accuracy, self-consistency, position bias, and name-swap bias on every PR — numbers published.",
};

export default function EvaluationPage() {
  const acc = Math.round((evalReport.accuracy?.accuracy ?? 0) * 100);
  const sigma = evalReport.selfConsistency?.meanStdev ?? 0;
  const tau = evalReport.positionBias?.meanTau ?? 0;
  const nameSwap = evalReport.nameSwapBias;

  return (
    <ProsePage
      eyebrow="Docs · Understand"
      title="Evaluation harness"
      lede="Most “AI resume screeners” are an unevaluated wrapper around one API call. An unevaluated ranker in hiring is a liability — so HireLens measures itself, on every PR, with a seeded benchmark through the same engine the product uses."
    >
      <h2>The four metrics</h2>
      <ul>
        <li>
          <strong>Direction accuracy</strong> — agreement with expected strong/weak per criterion
          against a benchmark set with known answers.
        </li>
        <li>
          <strong>Self-consistency</strong> — score variance across repeated runs of the same
          resume. 0 is deterministic; high variance means the model is guessing.
        </li>
        <li>
          <strong>Position bias</strong> — Kendall τ between rank orderings when input order is
          shuffled. 1.0 means rank order is invariant to resume order.
        </li>
        <li>
          <strong>Name-swap bias</strong> — score movement when <em>only the name changes</em>.
          Movement above 5 points is flagged. This is the direct test for name-based bias.
        </li>
      </ul>

      <h2>Current numbers</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Reading</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Direction accuracy</td>
            <td>{acc}%</td>
            <td>vs. mock-model expectations (plumbing run)</td>
          </tr>
          <tr>
            <td>Self-consistency</td>
            <td>{sigma}σ</td>
            <td>deterministic across repeats</td>
          </tr>
          <tr>
            <td>Position bias</td>
            <td>τ {tau}</td>
            <td>order-invariant</td>
          </tr>
          {nameSwap && (
            <tr>
              <td>Name-swap bias</td>
              <td>Δ {nameSwap.meanAbsDelta ?? 0}</td>
              <td>{(nameSwap.flaggedShare ?? 0) * 100}% flagged</td>
            </tr>
          )}
        </tbody>
      </table>

      <blockquote>
        These numbers come from the committed <code>packages/eval-report.json</code> — the offline
        mock-model run that validates harness plumbing in CI. Regenerate live against a real model
        with <code>pnpm --filter @hirelens/evals run evals</code> and your own key.
      </blockquote>

      <h2>Run it yourself</h2>
      <pre>
        <code>{`pnpm --filter @hirelens/evals run evals:mock   # offline, CI mode
pnpm --filter @hirelens/evals run evals        # live, needs HIRELENS_LLM_*`}</code>
      </pre>
      <p>
        The harness, benchmark dataset, and this report are plain files in{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/tree/main/packages/evals">
          packages/evals
        </a>{" "}
        — a CI test fails on regression beyond tolerance.
      </p>

      <h2>Why publish numbers that aren't flattering?</h2>
      <p>
        Because honesty is the product. The mock-model accuracy number is deliberately unimpressive
        — it validates that the measurement works, not that the model is good. Publish the harness,
        let anyone reproduce it, and let live-model runs be judged on their merits. That's what
        &ldquo;glass-box&rdquo; means when applied to ourselves.
      </p>
    </ProsePage>
  );
}
