import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Quickstart — CandidLens Docs",
  description:
    "From a clean machine to your first scored candidate: install, database, migrations, verification, and running the apps.",
};

export default function QuickstartPage() {
  return (
    <ProsePage
      eyebrow="Docs · Get started"
      title="Quickstart"
      lede="Clean machine → first scored candidate. Every command below was run and verified on Windows 11 and macOS with Node 22 / pnpm 11."
    >
      <h2>0. Prerequisites</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Version</th>
            <th>Check with</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Node.js</td>
            <td>20+ (CI runs 22)</td>
            <td>
              <code>node --version</code>
            </td>
          </tr>
          <tr>
            <td>pnpm</td>
            <td>11.x</td>
            <td>
              <code>pnpm --version</code>
            </td>
          </tr>
          <tr>
            <td>Docker Desktop</td>
            <td>recent</td>
            <td>
              <code>docker --version</code>
            </td>
          </tr>
          <tr>
            <td>Git</td>
            <td>recent</td>
            <td>—</td>
          </tr>
          <tr>
            <td>A model API key or Ollama</td>
            <td>Optional: needed only for scoring, rubric drafting and Ask</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
      <p>
        Enable pnpm via corepack (ships with Node): <code>corepack enable</code>. Nothing installs
        globally — every dependency lives in per-project <code>node_modules</code>, resolved from
        the committed lockfile.
      </p>

      <h2>1. Clone and install</h2>
      <pre>
        <code>{`git clone https://github.com/abhay-yemekar/candidlens.git
cd candidlens
pnpm install`}</code>
      </pre>
      <p>
        Ends with <code>Done</code> in a few minutes (~1 GB of packages on first run). If pnpm asks
        to approve build scripts, run <code>pnpm approve-builds</code>, select the listed packages,
        and re-run <code>pnpm install</code>.
      </p>

      <h2>2. Start the database</h2>
      <pre>
        <code>{`cp .env.example .env
docker compose up -d postgres
docker compose ps`}</code>
      </pre>
      <p>
        Starts only <code>hirelens-postgres</code> — Postgres 16 with pgvector, on port{" "}
        <strong>5433</strong> (deliberately offset from any local 5432). Status shows{" "}
        <code>Up (healthy)</code> after ~10 s.
      </p>
      <p>
        Compose reads the root <code>.env</code> and refuses to start anything while{" "}
        <code>BETTER_AUTH_SECRET</code> is empty, even when you start only Postgres. The example
        value is enough for now. A bare <code>docker compose up -d</code> also starts the API and
        web containers.
      </p>

      <h2>3. Configure the environment</h2>
      <pre>
        <code>{`cp packages/db/.env.example packages/db/.env`}</code>
      </pre>
      <p>
        Local-dev defaults work as-is. The <code>BETTER_AUTH_SECRET</code> in the example file is
        dev-only — generate a real one with <code>openssl rand -base64 32</code> for anything beyond
        local experimentation. OAuth variables are optional; empty means disabled.
      </p>

      <h2>4. Configure a model (optional)</h2>
      <pre>
        <code>{`cp apps/api/.env.example apps/api/.env`}</code>
      </pre>
      <p>
        The API dev server runs from <code>apps/api</code> and loads this file when it starts.
        Uncomment and set:
      </p>
      <ul>
        <li>
          <code>CANDIDLENS_LLM_PROVIDER</code>: <code>google</code>, <code>anthropic</code>,{" "}
          <code>groq</code>, <code>openrouter</code>, <code>mistral</code>, <code>cerebras</code> or{" "}
          <code>ollama</code>.
        </li>
        <li>
          <code>CANDIDLENS_LLM_MODEL</code>: a model id your provider serves, e.g.{" "}
          <code>gemini-2.5-flash</code> for <code>google</code>.
        </li>
        <li>
          <code>CANDIDLENS_LLM_API_KEY</code>: your provider&apos;s key. Every provider except
          Ollama needs one.
        </li>
        <li>
          <code>CANDIDLENS_LLM_BASE_URL</code>: required for Ollama, e.g.{" "}
          <code>http://localhost:11434/v1</code>.
        </li>
      </ul>
      <p>
        The API checks these when it starts. It stops with an error if the provider and model
        aren&apos;t set together, a hosted provider has no key, or Ollama has no base URL. For the
        Docker stack in step 7, put the same lines in the root <code>.env</code>. Failover and the
        retry budget are in <Link href="/docs/configuration#models">Configuration</Link>.
      </p>

      <h2>5. Migrate</h2>
      <pre>
        <code>{`pnpm --filter @candidlens/db db:migrate`}</code>
      </pre>
      <p>
        Prints <code>Migrations applied.</code> and creates all tables: identity and organizations,
        jobs, rubrics, candidates, documents, scoring runs, scores, evidence, audit log.
      </p>

      <h2>6. Verify your setup</h2>
      <pre>
        <code>{`pnpm typecheck   # strict TypeScript across every package
pnpm test        # full suite, including DB-backed integration tests`}</code>
      </pre>
      <p>
        The <code>api</code> and <code>orchestrator</code> integration tests need the database from
        step 2 — they create orgs, jobs and candidates, run real scoring batches through the mock
        model, and recompute the hash-chained audit log from stored rows.
      </p>

      <h2>7. Run the apps</h2>
      <p>
        The fastest path is the one-command stack. First replace <code>BETTER_AUTH_SECRET</code> in
        the root <code>.env</code> with a real secret: the API container runs in production mode and
        refuses the example value.
      </p>
      <pre>
        <code>{`openssl rand -base64 32   # paste the output into .env as BETTER_AUTH_SECRET
docker compose up --build -d
# web :3000 · api :4000 · postgres :5433`}</code>
      </pre>
      <p>Migrations apply automatically on API boot. For daily development instead:</p>
      <pre>
        <code>{`pnpm --filter @candidlens/api dev    # API on :4000
pnpm --filter @candidlens/web dev    # product UI on :3000`}</code>
      </pre>
      <p>
        Then:{" "}
        <strong>
          sign in / sign up → create an organization → create a job → upload resumes → score →
          review with evidence.
        </strong>
      </p>
      <p>
        Without a model, rubric drafting, scoring and Ask answer <code>503 llm_not_configured</code>
        . Uploading resumes, review, decisions and audits still work. To run the same steps from a
        terminal, use the <Link href="/docs/cli">CLI</Link>.
      </p>

      <h2>What &ldquo;everything works&rdquo; looks like</h2>
      <ul>
        <li>
          <code>docker compose ps</code> → postgres <strong>Up (healthy)</strong>
        </li>
        <li>
          <code>pnpm test</code> → all packages green, including the 3 integration tests
        </li>
        <li>
          <code>curl localhost:4000/api/health</code> → <code>{`{"ok":true}`}</code>
        </li>
      </ul>

      <p>
        Stuck? Every error we hit during development — and its fix — is in{" "}
        <Link href="/troubleshooting">Troubleshooting</Link>.
      </p>
    </ProsePage>
  );
}
