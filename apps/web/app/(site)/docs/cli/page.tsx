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
      <p>
        In CI, skip <code>login</code> and set <code>CANDIDLENS_COOKIE</code> to a session cookie as
        a <code>name=value</code> pair (locally <code>better-auth.session_token=…</code>). It is the
        same cookie session the web app uses, and it wins over a saved login. The old name{" "}
        <code>HIRELENS_COOKIE</code> still works.
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
              <code>hirelens whoami</code>
            </td>
            <td>Print the signed-in email</td>
          </tr>
          <tr>
            <td>
              <code>hirelens logout</code>
            </td>
            <td>Clear the session saved on this machine</td>
          </tr>
          <tr>
            <td>
              <code>hirelens org list</code>
            </td>
            <td>List your organizations</td>
          </tr>
          <tr>
            <td>
              <code>hirelens org create &quot;Acme Hiring&quot;</code>
            </td>
            <td>Create an organization (becomes the active tenant)</td>
          </tr>
          <tr>
            <td>
              <code>hirelens org use &lt;orgId&gt;</code>
            </td>
            <td>Switch the active organization</td>
          </tr>
          <tr>
            <td>
              <code>hirelens jobs list</code>
            </td>
            <td>List jobs in the active organization</td>
          </tr>
          <tr>
            <td>
              <code>hirelens jobs create &quot;Senior Backend&quot; --jd jd.md</code>
            </td>
            <td>Create a job from a JD file (or stdin if omitted)</td>
          </tr>
          <tr>
            <td>
              <code>hirelens rubric list &lt;jobId&gt;</code>
            </td>
            <td>List rubric versions</td>
          </tr>
          <tr>
            <td>
              <code>hirelens rubric derive &lt;jobId&gt;</code>
            </td>
            <td>LLM-derives the rubric from the JD</td>
          </tr>
          <tr>
            <td>
              <code>hirelens rubric import &lt;jobId&gt; --file r.json</code>
            </td>
            <td>Import a rubric JSON as a new version</td>
          </tr>
          <tr>
            <td>
              <code>hirelens score &lt;jobId&gt; ./resumes</code>
            </td>
            <td>Upload + score + ranked table</td>
          </tr>
          <tr>
            <td>
              <code>hirelens version</code>
            </td>
            <td>Print the version</td>
          </tr>
        </tbody>
      </table>

      <h2>score flags</h2>
      <pre>
        <code>{`hirelens score <jobId> ./resumes --breakdown   # per-criterion scores + evidence
hirelens score <jobId> ./resumes --json        # machine-readable output`}</code>
      </pre>
      <p>
        <code>score</code> takes a folder or a list of files. From a folder it uploads the files
        directly inside it (not subfolders) that end in <code>.pdf</code>, <code>.docx</code>,{" "}
        <code>.txt</code> or <code>.md</code>, and skips hidden files. A file you name with any
        other type stops the command. Uploading the same resume text to a job twice doesn&apos;t add
        a second candidate; the line says <code>duplicate</code>.
      </p>
      <p>
        It then scores every candidate on the job against the latest rubric version, prints a ranked
        table, and writes the run to the API (audit-chained, like any product run). Derive or import
        a rubric first; without one the API answers <code>409 no_rubric</code>.
      </p>
      <pre>
        <code>{`$ npx hirelens score <jobId> ./resumes
↑ alex-kim.md → created
↑ jane-doe.pdf → created
↑ sam-lee.docx → created
Scored 3/3 (failed: 0) — run 9b2f4c1e-5d7a-4e3b-8f60-2a1c7d9e4b18
RANK  CANDIDATE     OVERALL
────  ────────────  ───────
   1  jane-doe.pdf       82
   2  sam-lee.docx       74
   3  alex-kim.md        61`}</code>
      </pre>
      <p>
        The upload and <code>Scored</code> lines go to stderr; the table goes to stdout. Candidates
        are named by their file name, and <code>OVERALL</code> is the weighted score out of 100.
        With <code>--json</code>, stdout holds only{" "}
        <code>{`{ "runId", "ranked": [{ "rank", "candidateId", "name", "overall" }] }`}</code>.
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

      <h2>Running from source</h2>
      <pre>
        <code>{`pnpm --filter hirelens dev <command>
pnpm --filter hirelens dev whoami`}</code>
      </pre>
      <p>
        The <code>dev</code> script runs <code>node src/main.ts</code>, so Node runs the TypeScript
        source directly with no build step. That needs a Node version that strips types by default
        (22.18 or newer); the published package runs on Node 20 or newer. pnpm runs the script in{" "}
        <code>apps/cli</code>, so give file paths that are absolute or relative to that folder.
      </p>
    </ProsePage>
  );
}
