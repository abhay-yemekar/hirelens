import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Self-hosting — HireLens Docs",
  description:
    "Run HireLens entirely on your infrastructure: Docker Compose stack, environment variables, LLM providers including local Ollama, backups, and upgrades.",
};

export default function SelfHostingPage() {
  return (
    <ProsePage
      eyebrow="Docs · Get started"
      title="Self-hosting"
      lede="One command stands up the full stack — web, API, and Postgres with migrations applied on boot. Point the LLM at Ollama and your candidate data never touches a third party."
    >
      <h2>The 60-second version</h2>
      <pre>
        <code>{`git clone https://github.com/abhay-yemekar/hirelens.git && cd hirelens
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up --build -d`}</code>
      </pre>
      <p>
        web → <code>localhost:3000</code> · API health → <code>localhost:4000/api/health</code> ·
        Postgres → <code>localhost:5433</code>. Images build from <code>apps/api/Dockerfile</code>{" "}
        and <code>apps/web/Dockerfile</code>; rebuilds happen only when sources change.
      </p>

      <h2>What's in the stack</h2>
      <table>
        <thead>
          <tr>
            <th>Container</th>
            <th>Image</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>hirelens-postgres</td>
            <td>
              <code>pgvector/pgvector:pg16</code>
            </td>
            <td>
              Vector extension baked in; data in the <code>hirelens_pgdata</code> volume
            </td>
          </tr>
          <tr>
            <td>hirelens-api</td>
            <td>built from source</td>
            <td>Hono server; applies migrations on boot</td>
          </tr>
          <tr>
            <td>hirelens-web</td>
            <td>built from source</td>
            <td>Next.js standalone output</td>
          </tr>
        </tbody>
      </table>

      <h2>Environment variables</h2>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Required</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>BETTER_AUTH_SECRET</code>
            </td>
            <td>yes</td>
            <td>
              Auth signing secret — <code>openssl rand -base64 32</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>BETTER_AUTH_URL</code>
            </td>
            <td>yes</td>
            <td>
              Web origin (default <code>http://localhost:3000</code>)
            </td>
          </tr>
          <tr>
            <td>
              <code>DATABASE_URL</code>
            </td>
            <td>yes</td>
            <td>Postgres connection string</td>
          </tr>
          <tr>
            <td>
              <code>CORS_ORIGINS</code>
            </td>
            <td>no</td>
            <td>Allowed web origins (default covers :3000)</td>
          </tr>
          <tr>
            <td>
              <code>HIRELENS_LLM_PROVIDER</code> / <code>_MODEL</code> / <code>_API_KEY</code>
            </td>
            <td>no</td>
            <td>
              Enables real scoring; without them derive/score return{" "}
              <code>503 llm_not_configured</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>SENTRY_DSN</code>, <code>LANGFUSE_*</code>, <code>NEXT_PUBLIC_POSTHOG_KEY</code>
            </td>
            <td>no</td>
            <td>Observability — strict no-ops until set</td>
          </tr>
        </tbody>
      </table>

      <h2>Local LLM mode (resumes never leave)</h2>
      <p>
        Install <a href="https://ollama.com">Ollama</a>, pull a model, and point the API at it:
      </p>
      <pre>
        <code>{`HIRELENS_LLM_PROVIDER=ollama
HIRELENS_LLM_MODEL=llama3.1
HIRELENS_LLM_BASE_URL=http://host.docker.internal:11434`}</code>
      </pre>
      <p>
        With this configuration the entire pipeline — parsing, rubric derivation, scoring, evidence
        extraction — runs inside your network.
      </p>

      <h2>Backups</h2>
      <p>The entire state of an instance is one Postgres database:</p>
      <pre>
        <code>{`docker exec hirelens-postgres pg_dump -U postgres hirelens > backup.sql
# restore:
cat backup.sql | docker exec -i hirelens-postgres psql -U postgres hirelens`}</code>
      </pre>

      <h2>Upgrades</h2>
      <pre>
        <code>{`git pull
docker compose up --build -d`}</code>
      </pre>
      <p>
        Migrations run automatically on API boot. Down-time is one container restart. To wipe
        everything for a clean test: <code>docker compose down -v</code> — ⚠️ this deletes the data
        volume.
      </p>
    </ProsePage>
  );
}
