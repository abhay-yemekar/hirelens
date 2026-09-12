# Running HireLens locally — step-by-step

This guide takes you from a clean machine to a fully verified local setup. It is written for someone who has never seen this repository: every command, what it does, what output to expect, and a troubleshooting table built from **real errors** that occurred during development.

> Last verified: September 2026, Node 22 / pnpm 11.7 / Docker Desktop 4.x, Windows 11 + macOS. If this guide is wrong, that is a bug — please open an issue.

---

## 0. Prerequisites

| Tool | Version | Check with | Why |
|---|---|---|---|
| Node.js | **20 or newer** | `node --version` | Required by `engines` in `package.json`; CI runs on 22 |
| pnpm | **11.x** | `pnpm --version` | Workspace package manager (npm/yarn will not work) |
| Docker Desktop | recent | `docker --version` | Runs Postgres 16 + pgvector for the database |
| Git | recent | `git --version` | Clone and contribute |

Install pnpm if you have Node but not pnpm (corepack ships with Node and will activate the exact pnpm version pinned in `packageManager`):

```bash
corepack enable
```

> **Dependency isolation:** nothing in this project installs globally. Every dependency lives in the per-project `node_modules` (gitignored), resolved from the committed `pnpm-lock.yaml` — Node's equivalent of a Python virtualenv. `.npmrc` sets `engine-strict=true`, so installing or running with an unsupported Node version fails loudly instead of half-working.

Optional (not needed to run tests):

- **LLM access** — only for features that call a model (rubric derivation, scoring). Either an API key (Google Gemini, Anthropic, Groq, OpenRouter) or a local [Ollama](https://ollama.com) install. The test suite does **not** need any key — it uses a no-network mock model.
- **GitHub CLI** (`gh`) — only for maintainers opening PRs / reading CI.

## 1. Clone and install

```bash
git clone https://github.com/abhay-yemekar/hirelens.git
cd hirelens
pnpm install
```

**What happens:** pnpm resolves the pnpm workspace (`apps/*`, `packages/*`), installs all dependencies, and runs the workspace's build policy. Some dependencies (notably `@swc/core`, used by Storybook) ship native build steps; this repo pre-approves them in `pnpm-workspace.yaml` (`onlyBuiltDependencies`), so you should see no prompts.

**Expected output:** ends with `Done` in a few minutes. First run downloads ~1 GB of packages.

> **If pnpm asks to approve build scripts** (`Ignored build scripts: @swc/core …`) your pnpm version may be older than the repo's policy expects — run `pnpm approve-builds`, select the listed packages, and re-run `pnpm install`. Then run `pnpm install` once more; nothing else should remain unapproved.

## 2. Start the database

```bash
docker compose up -d
docker compose ps
```

**What happens:** starts a single container, `hirelens-postgres` — Postgres 16 with the **pgvector** extension baked in (`pgvector/pgvector:pg16`), listening on **localhost:5433** (not 5432 — deliberately offset to avoid clashing with any local Postgres). Credentials are `postgres` / `postgres`, database `hirelens`. A named volume `hirelens_pgdata` persists your data across restarts, and `docker/init/` enables the `vector` extension on first boot.

**Expected output of `docker compose ps`:** `hirelens-postgres` with status `Up` (healthy after ~10 s; the healthcheck runs `pg_isready`).

> **Docker Desktop must be running first** — on Windows/macOS, start the Docker Desktop app before `docker compose up`.

## 3. Configure the environment

```bash
cp packages/db/.env.example packages/db/.env
```

Open `packages/db/.env`. For local development the defaults work as-is:

```ini
DATABASE_URL=postgres://postgres:postgres@localhost:5433/hirelens
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=dev-only-secret-do-not-use-in-production-0123456789abcdef
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Notes:

- `BETTER_AUTH_SECRET` in the example file is **dev-only**. For anything beyond local dev, generate a real one: `openssl rand -base64 32` (Windows PowerShell: `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})` or use any password generator).
- The social-login variables are optional; empty means the provider is disabled.
- The packages that read this file load it via `dotenv` from their own directory — you do not need to export anything globally.

## 4. Create the database schema (migrate)

```bash
pnpm --filter @hirelens/db db:migrate
```

**What happens:** the migrate script connects to `DATABASE_URL`, runs `CREATE EXTENSION IF NOT EXISTS vector` (idempotent — safe even though `docker/init` already did it), then applies all Drizzle migrations from `packages/db/drizzle/` (identity/organization tables, jobs, candidates, rubrics, scoring runs, scores, evidence, audit log).

**Expected output:** `Migrations applied.`

To inspect the result:

```bash
docker exec -it hirelens-postgres psql -U postgres -d hirelens -c "\dt"
```

## 5. Verify your setup (recommended)

```bash
pnpm typecheck        # strict TypeScript across all 8 packages
pnpm test             # full test suite
pnpm build            # compiles every package
pnpm lint             # Biome check (format + lint)
```

**Expected output for `pnpm test`:** a Turborepo summary like `22 tasks` (cached/execution counts vary) and, inside the logs, roughly **89 tests passing** — ~76 unit tests in `core`, component tests in `ui`, and **3 integration tests in `orchestrator` that require the database from step 2 and the `.env` from step 3** (they create an org, a job, candidates, run a real scoring batch through the mock model, and verify the hash-chained audit log by recomputing it from stored rows).

> **The integration tests need Postgres running.** If the database is down, the orchestrator test task fails while all other tests still pass — see troubleshooting below.

## 6. Run the applications

### API server (`apps/api`)

```bash
cp apps/api/.env.example apps/api/.env   # then edit if needed
pnpm --filter @hirelens/api dev
# → http://localhost:4000/api/health  →  {"ok":true,"service":"hirelens-api","version":"0.1.0"}
```

The API is the full product surface: Better Auth at `/api/auth/*` (email/password sign-up, sign-in, organizations), then authenticated, org-scoped routes:

| Route | What it does |
|---|---|
| `GET /api/health` | Public health check |
| `POST /api/auth/sign-up/email`, `/sign-in/email` | Register / log in (Better Auth) |
| `GET/POST/PATCH /api/jobs` | Jobs CRUD (org-scoped) |
| `GET/POST /api/jobs/:id/rubrics`, `POST …/derive` | Rubric versions; `derive` = LLM JD → criteria |
| `POST /api/jobs/:id/candidates` | Upload a resume (PDF/DOCX/TXT/MD) — extract → parse → persist, deduped per job |
| `POST /api/jobs/:id/candidates/zip` | Batch-upload a ZIP of resumes |
| `POST /api/jobs/:id/score` | Score all candidates against the latest rubric (concurrency-bounded, audited) |
| `GET /api/jobs/:id/runs` | Scoring run history |
| `GET /api/jobs/:id/runs/:runId` | Run detail: per-candidate overall, criterion scores, evidence spans |
| `GET /api/jobs/:id/candidates` | Candidate list (metadata only — no resume text) |
| `GET /api/jobs/:id/candidates/:cid` | Candidate detail: parsed profile, document text, decisions |
| `GET /api/jobs/:id/review` | Ranked review table: latest overall per candidate + stage + overrides |
| `POST /api/jobs/:id/decisions` | Record a decision (stage + required reason; audit-chained) |
| `PATCH /api/jobs/:id/scores/:scoreId` | Manual score override (author + reason recorded, audited) |
| `PUT /api/jobs/:id/demographics/:cid` | Candidate's opt-in demographics self-report (merged per dimension) |
| `POST /api/jobs/:id/bias-audit` | Adverse-impact report: selection rates + four-fifths rule by group (audited) |

LLM features need `HIRELENS_LLM_PROVIDER` + `HIRELENS_LLM_MODEL` (+ key) in `apps/api/.env`; without them the server runs fine and derive/score return `503 llm_not_configured`. A partial LLM config fails at boot rather than half-working. Try the API with the bundled REST collection: import `docs/api.http` into VS Code (REST Client) or curl — see the file for ready-made requests.

### Product UI (`apps/web`)

```bash
pnpm --filter @hirelens/web dev
# → http://localhost:3000
```

The web app talks to the API on `:4000` (set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` to override; copy `apps/web/.env.example`). The API's `CORS_ORIGINS` must include the web origin (default covers `http://localhost:3000`).

Flow: **sign in / sign up** → **create or pick an organization** (`/welcome`; auto-redirect when a session has no active org) → **jobs list + creation** → **job detail** (import rubric, upload resumes, kick off scoring, run history) → **run detail** (`/jobs/:id/runs/:runId`): the candidate leaderboard with per-criterion scores, rationales, and clickable evidence quotes that scroll to and flash the exact highlighted span in the resume pane.

### Design-system playground (`packages/ui`)

```bash
pnpm --filter @hirelens/ui storybook
# → http://localhost:6006 — Button, Card, ScoreBadge, motion primitives, dark/light toggle
```

### CLI (`apps/cli`)

```bash
pnpm --filter @hirelens/cli dev
# → prints the version banner. (Command surface expands in a later phase.)
```

## 7. Daily development loop

```bash
docker compose up -d                 # if the DB isn't running
pnpm --filter @hirelens/db db:migrate
pnpm dev                             # runs every package's dev task in parallel
```

Other useful commands:

| Command | What it does |
|---|---|
| `pnpm --filter @hirelens/db db:studio` | Drizzle Studio — browse tables/rows in a browser UI |
| `pnpm --filter @hirelens/db db:extensions` | Re-run `CREATE EXTENSION vector` against `DATABASE_URL` |
| `pnpm format` | Auto-format everything with Biome |
| `pnpm lint` | Biome check (CI runs this; must be clean) |
| `pnpm typecheck` / `pnpm test` / `pnpm build` | Turborepo fan-out of each task across packages |

Git hooks (via husky + lint-staged + commitlint) enforce Biome formatting on staged files and [Conventional Commits](https://www.conventionalcommits.org) messages (`feat:`, `fix:`, `chore:`, `docs:`, …) automatically. Reset the database completely with `docker compose down -v` (⚠️ deletes all data in the volume).

## 8. Troubleshooting — real errors, real fixes

| Symptom (error text) | Cause | Fix |
|---|---|---|
| `error during connect: … docker engine is not running` (or `//./pipe/dockerDesktopLinuxEngine`) | Docker Desktop is not started | Start Docker Desktop, wait for it to be green, retry `docker compose up -d` |
| `port is already allocated` / `bind: address already in use` on **5433** | Another container or service owns 5433 (e.g. a second copy of this compose project) | `docker compose down` in any other checkout; or change the left side of `"5433:5432"` in `docker-compose.yml` **and** your `DATABASE_URL` consistently |
| `DATABASE_URL is required` from `db:migrate` | `packages/db/.env` missing or empty | Repeat step 3 (`cp packages/db/.env.example packages/db/.env`) |
| `password authentication failed for user "postgres"` | Connecting to a **different** Postgres than ours (a local 5432 install) | Confirm the URL uses port **5433** and points at `localhost`, and the compose stack is up |
| `relation "user" does not exist` (or any table) in tests | Migrations were never applied to this volume | Run `pnpm --filter @hirelens/db db:migrate`, re-run tests |
| Orchestrator integration tests fail, everything else passes | Database container stopped or unreachable | `docker compose up -d`, wait for `healthy` in `docker compose ps`, retry |
| `function gen_random_uuid() does not exist` | Postgres image without needed contrib modules | Use the pinned image `pgvector/pgvector:pg16` (it includes them) — this is why `docker-compose.yml` pins it |
| `type "vector" does not exist` | pgvector extension missing (non-Docker Postgres) | Run `pnpm --filter @hirelens/db db:extensions` with a superuser `DATABASE_URL`, or switch to the compose stack |
| `Ignored build scripts: @swc/core` warning at install | pnpm blocked native build scripts | `pnpm approve-builds` → approve listed packages → `pnpm install` again |
| `Unsupported engine` warning on install | Node older than 20 | Upgrade Node (nvm-windows / nvm / fnm all work) |
| CRLF / formatting diffs flood a PR on Windows | Git `core.autocrlf` rewrites line endings | Run `pnpm format` before committing; the repo's `.gitattributes`/Biome config expects LF |
| `EADDRINUSE` on 3000 / 4000 / 6006 | Another dev server (or a previous one that didn't shut down) is on that port | Kill the stale process (`npx kill-port 3000` or close the old terminal); ports are fixed by convention in this repo |
| Storybook page renders unstyled | Tailwind not wired through the Vite builder | Already configured in `packages/ui/.storybook/main.ts` (`@tailwindcss/vite`); if you added a new framework, wire the same plugin |
| `gh` commands fail with `command not found` (Windows) | GitHub CLI not on PATH in that shell | Add `C:\Program Files\GitHub CLI` to PATH, or use the full path to `gh.exe` |
| Every `pnpm` command fails with a corepack stack trace mentioning `runDepsStatusCheck` or `[ERR_PNPM_IGNORED_BUILDS]` | A placeholder value in `pnpm-workspace.yaml` `allowBuilds` (e.g. `core-js: set this to true or false`) makes install verification exit 1 | Set every `allowBuilds` entry to `true` or `false`, then `pnpm install` |
| Tests all report "skipped" (not failed) | `DATABASE_URL` not set in the shell that ran them | Export `DATABASE_URL=postgres://postgres:postgres@localhost:5433/hirelens` first (see step 3) |

Still stuck? Open an issue with your OS, Node/pnpm/Docker versions, the exact command, and the full error — see [SUPPORT.md](../SUPPORT.md).

## 9. What "everything works" looks like

- `docker compose ps` → `hirelens-postgres` **Up (healthy)**
- `pnpm --filter @hirelens/db db:migrate` → `Migrations applied.`
- `pnpm test` → all packages green, including the 3 orchestrator integration tests
- `pnpm --filter @hirelens/api dev` → `{"ok":true,…}` at `http://localhost:4000/api/health`
- `pnpm --filter @hirelens/ui storybook` → component playground at `http://localhost:6006`

That's the full local surface today. As phases land (API routes, product UI, RAG), this document gains a section per app — maintained with every phase, not at the end.

## 10. Observability (all optional)

Every observability integration is a **strict no-op until its env vars are set** — nothing phones home in a default local install.

| Concern | Enable with | Where to get the value |
|---|---|---|
| Structured logs | nothing — always on (pretty in dev, JSON in production) | change verbosity with `LOG_LEVEL` in `apps/api/.env` |
| Error tracking | `SENTRY_DSN` in `apps/api/.env` | Sentry → Settings → Client Keys (sentry.io free tier is fine) |
| LLM tracing | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` in `apps/api/.env` | Langfuse → Settings → API Keys (self-host via Docker or use cloud) |
| Product analytics | `NEXT_PUBLIC_POSTHOG_KEY` in `apps/web/.env.local` | PostHog → Settings → Project API key |

How to verify each one:

- **Logs**: start the API (`pnpm --filter @hirelens/api dev`) and hit any endpoint — every request prints a `http.request` line with a `requestId`, and responses carry the matching `x-request-id` header.
- **Sentry**: set the DSN, restart the API, trigger any 500 (e.g. stop Postgres and hit a data endpoint) — the error appears in Sentry within seconds, tagged with the request id.
- **Langfuse**: set both keys, restart the API, run a scoring batch — one trace per batch appears, with per-candidate generations showing token usage, latency, prompt hash, and per-criterion scores.
- **PostHog**: set the key, restart `apps/web`, click around — `scoring.kickoff` and `decision.recorded` events appear in PostHog live view. Autocapture is deliberately **off**: only explicit product events are sent, never raw DOM data.
