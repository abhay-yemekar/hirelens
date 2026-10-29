import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import evalReport from "../../../../../packages/eval-report.json";

export const metadata: Metadata = {
  title: "Evaluation harness — HireLens",
  description:
    "An unevaluated ranker is a liability. HireLens ships a seeded harness for direction accuracy, self-consistency, position bias, and name-swap bias. Real-model results aren't published yet.",
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
      lede="Most “AI resume screeners” are an unevaluated wrapper around one API call. An unevaluated ranker in hiring is a liability — so HireLens ships a seeded benchmark harness that runs through the same engine the product uses. A mock-model run checks the harness on every PR; real-model results aren't published yet."
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
          <strong>Position bias</strong> — Kendall τ between the ranking from scoring the pool in
          its original order and the ranking from scoring it in reverse. 1.0 means order made no
          difference. Each resume is scored in its own call, so this mainly measures how stable the
          ranking is from run to run.
        </li>
        <li>
          <strong>Name-swap bias</strong> — score movement when <em>only the name changes</em>.
          Movement above 5 points is flagged. This is the direct test for name-based bias.
        </li>
      </ul>

      <h2>Plumbing check (mock model)</h2>
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
            <td>base rate of a mock that scores every criterion 3 — not a quality signal</td>
          </tr>
          <tr>
            <td>Self-consistency</td>
            <td>{sigma}σ</td>
            <td>0 by construction for a constant mock</td>
          </tr>
          <tr>
            <td>Position bias</td>
            <td>τ {tau}</td>
            <td>1 by construction for a constant mock</td>
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
        These numbers come from the committed <code>packages/eval-report.json</code>: an offline
        mock model that returns the same score for every criterion. They show the harness runs end
        to end, not how well any real model ranks resumes. Real-model results: not measured yet. Run
        them against your own model with <code>pnpm --filter @hirelens/evals run evals</code>.
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
        — a unit test runs the harness against the mock model in CI, so a broken harness fails the
        build.
      </p>

      <h2>Why show a mock run at all?</h2>
      <p>
        Because honesty is the product. The mock run proves the measurement works; it says nothing
        about model quality, so it&apos;s labelled that way and kept off the landing page. Publish
        the harness, let anyone reproduce it, and judge real-model runs on their merits. That&apos;s
        what &ldquo;glass-box&rdquo; means when applied to ourselves.
      </p>
    </ProsePage>
  );
}
