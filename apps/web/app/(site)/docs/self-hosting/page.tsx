import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Self-hosting — CandidLens Docs",
  description:
    "Run CandidLens entirely on your infrastructure: Docker Compose stack, environment variables, LLM providers including local Ollama, backups, and upgrades.",
};

export default function SelfHostingPage() {
  return (
    <ProsePage
      eyebrow="Docs · Get started"
      title="Self-hosting"
      lede="One command starts the full stack: web, API and Postgres, with migrations applied on boot. Run the model on Ollama and leave the API keys empty, and resumes never leave your network."
    >
      <h2>The 60-second version</h2>
      <pre>
        <code>{`git clone https://github.com/abhay-yemekar/hirelens.git && cd hirelens
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up --build -d`}</code>
      </pre>
      <p>
        You need Docker Compose 2.24 or newer, because <code>docker-compose.yml</code> loads{" "}
        <code>.env</code> with <code>required: false</code>.
      </p>
      <p>To check that it works:</p>
      <ol>
        <li>
          Open <code>localhost:3000</code>, create an account, then create an organization.
        </li>
        <li>
          Open <code>localhost:4000/api/health</code>. The API answers{" "}
          <code>&quot;ok&quot;: true</code> and shows whether a model is configured.
        </li>
      </ol>
      <p>
        Only Postgres has a healthcheck, so it is the only service <code>docker compose ps</code>{" "}
        reports as healthy. Postgres listens on <code>localhost:5433</code>. The images build from{" "}
        <code>apps/api/Dockerfile</code> and <code>apps/web/Dockerfile</code>.
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
              Signs sessions. Generate it with <code>openssl rand -base64 32</code>; Compose
              won&apos;t start without it.
            </td>
          </tr>
          <tr>
            <td>
              <code>BETTER_AUTH_URL</code>
            </td>
            <td>no</td>
            <td>
              Better Auth&apos;s base address. Compose and <code>.env.example</code> both use{" "}
              <code>http://localhost:4000</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>DATABASE_URL</code>
            </td>
            <td>no</td>
            <td>
              Postgres connection. Compose sets it for the API container; outside Compose the API
              defaults to <code>postgres://postgres:postgres@localhost:5433/hirelens</code>.
            </td>
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
              <code>CANDIDLENS_LLM_PROVIDER</code> / <code>_MODEL</code> / <code>_API_KEY</code>
            </td>
            <td>no</td>
            <td>
              Enables real scoring; without them derive/score return{" "}
              <code>503 llm_not_configured</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>CANDIDLENS_LLM_FALLBACKS</code> (+ per-provider{" "}
              <code>CANDIDLENS_LLM_&lt;ID&gt;_MODEL</code>, <code>_API_KEY</code>,{" "}
              <code>_BASE_URL</code>)
            </td>
            <td>no</td>
            <td>
              Failover chain for overloaded moments. Every fallback needs its own{" "}
              <code>_MODEL</code> (a provider never inherits another provider&apos;s model id —
              validation fails at boot otherwise), e.g. <code>openai/gpt-oss-120b</code> for Groq.
            </td>
          </tr>
          <tr>
            <td>
              <code>CANDIDLENS_LLM_DEADLINE_MS</code>
            </td>
            <td>no</td>
            <td>
              Overall retry/failover deadline in ms (default 120000). Keeps the retry ladder inside
              serverless function limits.
            </td>
          </tr>
          <tr>
            <td>
              <code>CANDIDLENS_SMTP_USER</code> / <code>_PASSWORD</code> (+ <code>_HOST</code>,{" "}
              <code>_PORT</code>, <code>CANDIDLENS_MAIL_FROM</code>)
            </td>
            <td>no</td>
            <td>
              Email for password reset and address confirmation; the defaults fit a Gmail app
              password. Also set <code>NEXT_PUBLIC_EMAIL_ENABLED=true</code> so the web image offers
              &ldquo;Forgot password?&rdquo;.
            </td>
          </tr>
          <tr>
            <td>
              <code>SENTRY_DSN</code>, <code>LANGFUSE_*</code>, <code>NEXT_PUBLIC_POSTHOG_KEY</code>
            </td>
            <td>no</td>
            <td>Observability; off until set</td>
          </tr>
        </tbody>
      </table>
      <p>
        <Link href="/docs/configuration">Configuration</Link> lists every setting. The model
        providers are <code>google</code>, <code>anthropic</code>, <code>groq</code>,{" "}
        <code>openrouter</code>, <code>mistral</code>, <code>cerebras</code> and <code>ollama</code>
        . Empty values count as unset.
      </p>
      <p>
        The API container reads every setting in the root <code>.env</code>; Compose fixes only{" "}
        <code>DATABASE_URL</code>, <code>NODE_ENV</code> and <code>PORT</code>. The web image takes
        the <code>NEXT_PUBLIC_*</code> settings when it is built, so rebuild it after changing them:{" "}
        <code>docker compose up --build -d web</code>.
      </p>
      <p>
        Settings used to be named <code>HIRELENS_*</code>. Those names still work; when both are
        set, the <code>CANDIDLENS_*</code> name wins.
      </p>

      <h2>Local LLM mode (resumes never leave)</h2>
      <p>
        Install <a href="https://ollama.com">Ollama</a>, pull a model, and point the API at it:
      </p>
      <pre>
        <code>{`CANDIDLENS_LLM_PROVIDER=ollama
CANDIDLENS_LLM_MODEL=llama3.1
CANDIDLENS_LLM_BASE_URL=http://host.docker.internal:11434/v1`}</code>
      </pre>
      <p>
        Leave <code>CANDIDLENS_LLM_API_KEY</code> and <code>CANDIDLENS_EMBEDDING_API_KEY</code>{" "}
        empty. Parsing, rubric drafting, scoring and evidence extraction then run inside your
        network, and search matches keywords instead of meaning.
      </p>
      <p>The API calls out only for what you turn on:</p>
      <ul>
        <li>Your model provider. With Ollama, that is your own machine.</li>
        <li>
          Google&apos;s embedding API, for search by meaning, when an embedding key is set (see{" "}
          <Link href="/docs/configuration#models">Configuration</Link>). It receives resume text.
        </li>
        <li>Your SMTP server, when you set up email.</li>
        <li>The resume link in each ATS webhook call, when you connect an ATS.</li>
        <li>
          Sentry and Langfuse, when you set their keys. PostHog runs in the browser and needs{" "}
          <code>NEXT_PUBLIC_POSTHOG_KEY</code>.
        </li>
      </ul>
      <p>
        With Ollama, no keys, email unset and no ATS connected, the API makes no outside calls and
        resumes never leave your network.
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
