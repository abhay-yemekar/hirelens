import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "CLI reference — CandidLens Docs",
  description:
    "The hirelens CLI: login, organizations, jobs, rubric derivation, and the score pipeline from your terminal. Zero runtime dependencies.",
};

export default function CliPage() {
  return (
    <ProsePage
      eyebrow="Docs · Get started"
      title="CLI reference"
      lede="hirelens is a zero-runtime-dependency CLI published on npm — run it with npx on Node ≥ 20. The full pipeline, from a terminal."
    >
      <h2>Setup</h2>
      <pre>
        <code>{`export CANDIDLENS_API_URL=http://localhost:4000     # the API
export CANDIDLENS_CONFIG_DIR=~/.hirelens            # optional; cookie storage

npx hirelens login you@example.com`}</code>
      </pre>
      <p>
        <code>login</code> prompts for your password (or set <code>CANDIDLENS_PASSWORD</code> for
        scripts). Accounts are created in the web UI or via the sign-up API; the CLI signs existing
        accounts in. Sessions persist to <code>~/.hirelens/</code>.
      </p>

      <h2>Commands</h2>
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>hirelens login &lt;email&gt;</code>
            </td>
            <td>Authenticate; stores the session cookie</td>
          </tr>
          <tr>
            <td>
              <code>hirelens org create &quot;Acme Hiring&quot;</code>
            </td>
            <td>Create an organization (becomes the active tenant)</td>
          </tr>
          <tr>
            <td>
              <code>hirelens jobs create &quot;Senior Backend&quot; --jd jd.md</code>
            </td>
            <td>Create a job from a JD file (or stdin if omitted)</td>
          </tr>
          <tr>
            <td>
              <code>hirelens rubric derive &lt;jobId&gt;</code>
            </td>
            <td>LLM-derives the rubric from the JD</td>
          </tr>
          <tr>
            <td>
              <code>hirelens score &lt;jobId&gt; ./resumes</code>
            </td>
            <td>Upload + score + ranked table</td>
          </tr>
        </tbody>
      </table>

      <h2>score flags</h2>
      <pre>
        <code>{`hirelens score <jobId> ./resumes --breakdown   # per-criterion scores + evidence
hirelens score <jobId> ./resumes --json        # machine-readable output`}</code>
      </pre>
      <p>
        <code>score</code> uploads every <code>.txt/.md/.pdf</code> in the path, prints a ranked
        table, and writes the run to the API (audit-chained, like any product run).
      </p>

      <blockquote>
        <strong>Known gotcha:</strong> <code>jobs create</code> without <code>--jd</code> reads the
        description from stdin, which never closes in a scripted shell — always pass{" "}
        <code>--jd &lt;file&gt;</code> (or pipe input) outside interactive use.
      </blockquote>

      <h2>Example end-to-end</h2>
      <pre>
        <code>{`npx hirelens org create "Acme Hiring"
npx hirelens jobs create "Senior Backend Engineer" --jd jd.md
npx hirelens rubric derive <jobId>
npx hirelens score <jobId> ./resumes --breakdown`}</code>
      </pre>
      <p>
        LLM commands (<code>rubric derive</code>, <code>score</code>) require{" "}
        <code>CANDIDLENS_LLM_*</code> configuration on the <em>API</em> side — the CLI itself holds
        no keys.
      </p>
    </ProsePage>
  );
}
