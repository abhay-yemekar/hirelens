import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Troubleshooting — HireLens",
  description:
    "Real errors hit during HireLens development, with verified fixes: Docker, migrations, ports, auth, LLM providers, and more.",
};

const ROWS: Array<{ symptom: string; cause: string; fix: string }> = [
  {
    symptom: "error during connect: … docker engine is not running",
    cause: "Docker Desktop isn't started.",
    fix: "Start Docker Desktop, wait for it to be green, retry docker compose up -d.",
  },
  {
    symptom: "port is already allocated / bind: address already in use on 5433",
    cause: "Another container or a second copy of this compose project owns 5433.",
    fix: "docker compose down in any other checkout; or change the host port in docker-compose.yml and DATABASE_URL consistently.",
  },
  {
    symptom: "DATABASE_URL is required (from db:migrate)",
    cause: "packages/db/.env is missing or empty.",
    fix: "cp packages/db/.env.example packages/db/.env, then migrate again.",
  },
  {
    symptom: 'password authentication failed for user "postgres"',
    cause: "You're talking to a different Postgres (e.g. a local 5432 install).",
    fix: "Confirm the URL uses port 5433 and points at localhost, and the compose stack is up.",
  },
  {
    symptom: 'relation "user" does not exist',
    cause: "Migrations were never applied to this volume.",
    fix: "Run pnpm --filter @hirelens/db db:migrate and re-run tests.",
  },
  {
    symptom: "Orchestrator integration tests fail, everything else passes",
    cause: "Database container stopped or unreachable.",
    fix: "docker compose up -d, wait for healthy in docker compose ps, retry.",
  },
  {
    symptom: 'type "vector" does not exist',
    cause: "Non-Docker Postgres without pgvector.",
    fix: "Use the pinned pgvector/pgvector:pg16 image, or run db:extensions with a superuser URL.",
  },
  {
    symptom: "EADDRINUSE on 3000 / 4000 / 6006",
    cause: "A stale dev server holds the port.",
    fix: "Kill it (npx kill-port 3000) or close the old terminal; ports are fixed by convention.",
  },
  {
    symptom: "401 sign_in_failed right after a fresh API sign-up",
    cause: "better-auth requires an Origin header matching a trusted origin on sign-up.",
    fix: 'Sign up once via the web UI, or send -H "Origin: http://localhost:3000" with curl/CLI.',
  },
  {
    symptom: "503 llm_not_configured from derive/score in Docker",
    cause: 'Empty-string HIRELENS_LLM_* values count as "set" through compose interpolation.',
    fix: "Put real provider/model/key values in the root .env, then docker compose up -d api.",
  },
  {
    symptom: "LlmRuntimeError: … Proto field is not repeating, cannot start list (Gemini)",
    cause:
      "Gemini rejects JSON schemas with arrays nested in arrays — our rubric schemas use that shape.",
    fix: "Already fixed: generateStructured auto-falls back to validated JSON-text mode per provider. Update to current main.",
  },
  {
    symptom: "hirelens score hangs after creating a job",
    cause: "jobs create without --jd reads the JD from stdin, which never closes in scripts.",
    fix: "Always pass --jd <file> (or pipe input).",
  },
  {
    symptom: "Every pnpm command fails with a corepack stack trace (ERR_PNPM_IGNORED_BUILDS)",
    cause: "A placeholder value in pnpm-workspace.yaml allowBuilds.",
    fix: "Set every allowBuilds entry to true or false, then pnpm install.",
  },
  {
    symptom: "CRLF formatting diffs flood a PR on Windows",
    cause: "git core.autocrlf rewrites line endings.",
    fix: "Run pnpm format before committing; the repo expects LF (.gitattributes + Biome).",
  },
];

export default function TroubleshootingPage() {
  return (
    <ProsePage
      eyebrow="Docs · Operate"
      title="Troubleshooting"
      lede="Every error below actually happened during development. If this guide is wrong, that is a bug — please open an issue."
    >
      <table>
        <thead>
          <tr>
            <th>Symptom</th>
            <th>Cause</th>
            <th>Fix</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.symptom}>
              <td>
                <code>{r.symptom}</code>
              </td>
              <td>{r.cause}</td>
              <td>{r.fix}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Still stuck?</h2>
      <p>
        Open an issue with your OS, Node/pnpm/Docker versions, the exact command, and the full error
        — the <a href="/contact">contact page</a> has the links. Security issues go through the
        private process in <a href="/security">SECURITY.md</a>, never a public issue.
      </p>
    </ProsePage>
  );
}
