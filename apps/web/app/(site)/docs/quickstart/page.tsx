import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Quickstart — HireLens Docs",
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
        </tbody>
      </table>
      <p>
        Enable pnpm via corepack (ships with Node): <code>corepack enable</code>. Nothing installs
        globally — every dependency lives in per-project <code>node_modules</code>, resolved from
        the committed lockfile.
      </p>

      <h2>1. Clone and install</h2>
      <pre>
        <code>{`git clone https://github.com/abhay-yemekar/hirelens.git
cd hirelens
pnpm install`}</code>
      </pre>
      <p>
        Ends with <code>Done</code> in a few minutes (~1 GB of packages on first run). If pnpm asks
        to approve build scripts, run <code>pnpm approve-builds</code>, select the listed packages,
        and re-run <code>pnpm install</code>.
      </p>

      <h2>2. Start the database</h2>
      <pre>
        <code>{`docker compose up -d
docker compose ps`}</code>
      </pre>
      <p>
        Starts <code>hirelens-postgres</code> — Postgres 16 with pgvector, on port{" "}
        <strong>5433</strong> (deliberately offset from any local 5432). Status shows{" "}
        <code>Up (healthy)</code> after ~10 s.
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

      <h2>4. Migrate</h2>
      <pre>
        <code>{`pnpm --filter @hirelens/db db:migrate`}</code>
      </pre>
      <p>
        Prints <code>Migrations applied.</code> and creates all tables: identity and organizations,
        jobs, rubrics, candidates, documents, scoring runs, scores, evidence, audit log.
      </p>

      <h2>5. Verify your setup</h2>
      <pre>
        <code>{`pnpm typecheck   # strict TypeScript across all 8 packages
pnpm test        # full suite (~89 tests)`}</code>
      </pre>
      <p>
        The suite includes 3 orchestrator integration tests that need the database from step 2 —
        they create an org, a job, candidates, run a real scoring batch through the mock model, and
        recompute the hash-chained audit log from stored rows.
      </p>

      <h2>6. Run the apps</h2>
      <p>The fastest path is the one-command stack:</p>
      <pre>
        <code>{`cp .env.example .env      # set BETTER_AUTH_SECRET
docker compose up --build -d
# web :3000 · api :4000 · postgres :5433`}</code>
      </pre>
      <p>Migrations apply automatically on API boot. For daily development instead:</p>
      <pre>
        <code>{`pnpm --filter @hirelens/api dev    # API on :4000
pnpm --filter @hirelens/web dev    # product UI on :3000
pnpm --filter @hirelens/docs dev   # docs site on :3002`}</code>
      </pre>
      <p>
        Then:{" "}
        <strong>
          sign in / sign up → create an organization → create a job → upload resumes → score →
          review with evidence.
        </strong>{" "}
        LLM scoring needs <code>HIRELENS_LLM_PROVIDER</code> + <code>HIRELENS_LLM_MODEL</code> (+
        key) in the API env; without them the server runs fine and scoring returns{" "}
        <code>503 llm_not_configured</code>.
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
        <a href="/troubleshooting">Troubleshooting</a>.
      </p>
    </ProsePage>
  );
}
