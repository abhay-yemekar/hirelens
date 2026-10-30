import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";
import evalReport from "../../../../../packages/eval-report.json";
import groqReport from "../../../../../packages/evals/reports/2026-10-30-groq-openai-gpt-oss-120b.json";

export const metadata: Metadata = {
  title: "Evaluation harness — HireLens",
  description:
    "An unevaluated ranker is a liability. HireLens ships a seeded harness for direction accuracy, self-consistency, position bias, and name-swap bias, with a first real-model run published.",
};

/** 95% Wilson score interval for k successes out of n, as whole percents. */
function wilson95(k: number, n: number): [number, number] {
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.round((centre - half) * 100), Math.round((centre + half) * 100)];
}

export default function EvaluationPage() {
  const acc = Math.round((evalReport.accuracy?.accuracy ?? 0) * 100);
  const sigma = evalReport.selfConsistency?.meanStdev ?? 0;
  const tau = evalReport.positionBias?.meanTau ?? 0;
  const nameSwap = evalReport.nameSwapBias;
  const live = groqReport;
  const liveCi = wilson95(live.accuracy.agreed, live.accuracy.total);

  return (
    <ProsePage
      eyebrow="Docs · Understand"
      title="Evaluation harness"
      lede="Most “AI resume screeners” are an unevaluated wrapper around one API call. An unevaluated ranker in hiring is a liability — so HireLens ships a seeded benchmark harness that runs through the same engine the product uses. A mock-model run checks the harness on every PR, and real-model runs are published with their provenance."
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

      <h2>First real-model run</h2>
      <p>
        <code>{live.provider}</code> / <code>{live.model}</code>, run on {live.date} with seed{" "}
        {live.seed} against rubric v{live.rubricVersion}: {live.resumes} synthetic resumes and{" "}
        {live.accuracy.total} expected strong/weak labels. Raw report:{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/tree/main/packages/evals/reports">
          packages/evals/reports
        </a>
        .
      </p>
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
            <td>
              {live.accuracy.agreed}/{live.accuracy.total}
            </td>
            <td>
              95% interval {liveCi[0]}–{liveCi[1]}%: wide, because the benchmark is small
            </td>
          </tr>
          <tr>
            <td>Self-consistency</td>
            <td>{live.selfConsistency.meanStdev}σ</td>
            <td>
              mean wobble across {live.selfConsistency.repeats} reruns; worst spread{" "}
              {live.selfConsistency.maxRange} points on the 0–100 overall
            </td>
          </tr>
          <tr>
            <td>Position bias</td>
            <td>τ {live.positionBias.meanTau}</td>
            <td>ranking mostly stable between the two passes</td>
          </tr>
          <tr>
            <td>Name-swap bias</td>
            <td>Δ {live.nameSwapBias.meanAbsDelta}</td>
            <td>
              max Δ {live.nameSwapBias.maxAbsDelta};{" "}
              {Math.round(live.nameSwapBias.flaggedShare * 100)}% of resumes moved more than{" "}
              {live.nameSwapBias.tolerance} points
            </td>
          </tr>
          <tr>
            <td>Rank agreement</td>
            <td>τ {live.rankAgreement}</td>
            <td>final order matched the expected order</td>
          </tr>
        </tbody>
      </table>
      <blockquote>
        Read these as a first data point, not a verdict. Six resumes cannot support strong claims,
        and the rerun noise (up to {live.selfConsistency.maxRange} points) is larger than the
        name-swap tolerance ({live.nameSwapBias.tolerance} points), so at this sample size the
        name-swap result cannot separate name bias from ordinary run-to-run variation. A larger
        benchmark and repeated swap runs are the next step. Results for a second model are not
        measured yet.
      </blockquote>

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
        to end, not how well any real model ranks resumes; the real-model run is above. Run them
        against your own model with <code>pnpm --filter @hirelens/evals run evals</code>.
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
