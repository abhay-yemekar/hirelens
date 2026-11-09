<div align="center">

<a href="https://candidlens.vercel.app">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/mark-on-dark.svg">
    <img src="docs/brand/mark.svg" alt="CandidLens" width="88">
  </picture>
</a>

# CandidLens

**See why, not just who.**

Open-source resume screening where every score quotes the resume line behind it.<br/>
Rank candidates against a rubric you control, decide with stated reasons, and audit yourself for adverse impact.

**[Live demo, no signup](https://candidlens.vercel.app/demo)** · [Resume Doctor](https://candidlens.vercel.app/doctor) · [Docs](https://candidlens.vercel.app/docs) · [Self-host](#self-host-in-one-command) · [Roadmap](https://candidlens.vercel.app/roadmap)

[![CI](https://github.com/abhay-yemekar/candidlens/actions/workflows/ci.yml/badge.svg)](https://github.com/abhay-yemekar/candidlens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/hirelens?label=cli&color=ff6b57)](https://www.npmjs.com/package/hirelens)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<img src="docs/readme/hero.png" alt="CandidLens: a ranked review queue next to the evidence view, where the resume line behind a 5/5 score is highlighted" width="100%">

<img src="docs/demo.gif" alt="The live demo scoring a synthetic resume: the overall score, a score per criterion, and the resume lines each score quotes, highlighted" width="100%">

<sub>The <a href="https://candidlens.vercel.app/demo">live demo</a> scoring a synthetic resume. Click a criterion to see the resume lines it quotes.</sub>

</div>

> [!NOTE]
> **HireLens is now CandidLens.** The app and the site use the new name. The GitHub repository, the `hirelens` npm CLI and the `hirelens-*` Docker images keep the old name until the next release.

## Why CandidLens

Most hiring AI hands you a number with no reasons. That fails candidates, leaves recruiters guessing, and is a liability under rules like NYC Local Law 144 and the EU AI Act. CandidLens is built around a different contract:

- **Every score links to its evidence.** Each criterion quotes the exact resume text that produced it, at its character offset. If the quote isn't really in the resume, the score is withheld instead of guessed.
- **Every decision has a reason, and every action leaves a trail.** Decisions need a stated reason and land in a hash-chained audit log that shows any tampering.
- **Fairness is measured, not promised.** Anyone with viewer access can run an adverse-impact report, and the scoring engine is benchmarked in the open, weaknesses included.

An AI score is a screening aid, not a hiring decision.

## Get started

### Try it online

- **[Recruiter demo](https://candidlens.vercel.app/demo):** the real scoring engine on 12 synthetic resumes. Pick one, score it, click a criterion to see the quoted evidence.
- **[Resume Doctor](https://candidlens.vercel.app/doctor):** paste a resume or upload a PDF or Word file for a deterministic 0–100 check, every finding pinned to its line.
- **[Score my resume](https://candidlens.vercel.app/self-check):** score your resume against any job description with the same rubric engine. Free, no signup.

### Self-host in one command

```bash
git clone https://github.com/abhay-yemekar/candidlens.git && cd candidlens
cp .env.example .env                # set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up --build -d        # web :3000 · API :4000 · Postgres :5433
```

Open [localhost:3000](http://localhost:3000), create an account and an organization, and add a model key to `.env` to score. Migrations run on first boot. Prebuilt images are on GHCR: [`hirelens-web`](https://ghcr.io/abhay-yemekar/candidlens-web) and [`hirelens-api`](https://ghcr.io/abhay-yemekar/candidlens-api).

### Develop

```bash
pnpm install
docker compose up -d postgres                 # Postgres 16 + pgvector on :5433
cp packages/db/.env.example packages/db/.env
pnpm --filter @candidlens/db db:migrate
pnpm --filter @candidlens/api dev             # API on :4000
pnpm --filter @candidlens/web dev             # app on :3000 (second terminal)
```

Node 20+, pnpm 11 and Docker. The full walkthrough, with expected output and fixes for real errors, is in [docs/project_execution.md](docs/project_execution.md).

## Features

### For recruiters

- **Rubrics you control:** paste a job description and get 5–8 weighted criteria with an anchored 0–5 scale. Review and edit before anything is scored; rubrics are versioned and exportable.
- **Evidence-linked scoring:** each criterion gets a score, a rationale, a confidence and the quoted evidence. Click a criterion and the exact span lights up in the resume.
- **A review queue with reasons:** advance, shortlist or reject, each with a required reason. Compare candidates side by side.
- **Blind review:** names, emails and other identity cues are masked, with quote offsets kept aligned.
- **Search and ask:** semantic search over every resume (pgvector), and answers with citations the server checks.
- **Talent pool:** one search across every candidate from every job, with skill, stage and score filters, and "add to job" to bring a past applicant back.
- **Interview kits:** a printable debrief per candidate, with probe questions from the rubric and the evidence to listen for.
- **Format check on upload:** catches scanned pages, tables, broken encoding and missing sections before a scoring run is wasted.

### For candidates

- **[Resume Doctor](https://candidlens.vercel.app/doctor):** deterministic checks for contact details, structure, dates, impact, length and parseability. No model involved, so the same text always gets the same report.
- **[Score my resume](https://candidlens.vercel.app/self-check)**, **[interview practice](https://candidlens.vercel.app/interview-practice)** from any job description, and an **[application tracker](https://candidlens.vercel.app/tracker)** that stays on your device.
- **[Candidate reports](https://candidlens.vercel.app/for-candidates):** a recruiter can share your evidence-backed score with you through a single-use, revocable link.

### For teams and compliance

- **Bias audit:** per-group selection rates, the EEOC four-fifths rule and demographic parity, with scheduled snapshots and JSON export. Demographics are opt-in and self-reported only.
- **Tamper-evident audit log:** every decision, override and share is hash-chained, and exports as a verifiable CSV.
- **Teams and sharing:** owner, recruiter, hiring manager and viewer roles; read-only report links you can revoke.
- **Accounts that hold up:** email or Google and GitHub sign-in, password reset and email confirmation, change of email, sign-out of other devices, and account deletion that keeps shared audit logs intact.

### For developers

- **Any model:** Google, Anthropic, Groq, OpenRouter, Mistral, Cerebras, or fully local with Ollama, so resumes never have to leave your machine. A failover chain moves to the next provider when one is overloaded.
- **API:** an org-scoped REST API with a live [OpenAPI 3.1 contract](https://candidlens.vercel.app/api/openapi.json); CI fails if a route ships without a spec entry. A stateless [public parser API](https://candidlens.vercel.app/api-reference) turns a resume into JSON-Resume-compatible data.
- **CLI:** `hirelens login · jobs · rubric derive · score`, the whole pipeline from a terminal, with no runtime dependencies.
- **Observability:** structured logs always; Sentry, Langfuse and PostHog only when you set their keys. Nothing phones home by default.

## How it works

```mermaid
flowchart LR
    JD["Job description"] --> RUB["Rubric<br/>5–8 weighted criteria"]
    RES["Resumes<br/>PDF · Word · text"] --> PARSE["Extract and parse"]
    RUB --> SCORE["Score each criterion<br/>0–5 with a quote"]
    PARSE --> SCORE
    SCORE --> CHECK{"Quote found<br/>in the resume?"}
    CHECK -- yes --> QUEUE["Review queue<br/>decide with a reason"]
    CHECK -- no --> HOLD["Score withheld<br/>for review"]
    HOLD --> QUEUE
    QUEUE --> AUDIT[("Hash-chained<br/>audit log")]
    QUEUE --> BIAS["Bias audit<br/>four-fifths rule"]
```

`packages/core` holds the engines: extraction, parsing, rubrics, scoring, evidence matching, blind review and the audit chain. They are plain TypeScript with no framework, so the web app, the API, the CLI and the evaluation harness all run the same code.

<details>
<summary><b>Repository layout</b></summary>

```
apps/
  web/            Next.js app: product UI, marketing site, /demo; mounts the API at /api
  api/            Hono API: auth, jobs, rubrics, upload, scoring, audits, accounts
  cli/            The hirelens CLI (TypeScript, no runtime dependencies)
packages/
  core/           The engines: extract, parse, rubric, score, evidence, llm, audit, doctor
  db/             Drizzle schema and migrations (Postgres + pgvector), auth and email
  orchestrator/   Batch scoring and the hash-chained audit writer
  ui/             Design system: tokens, components, Storybook
  evals/          Benchmark dataset and the accuracy, consistency and bias harness
  config/         Shared TypeScript and Biome presets
```

</details>

## Measured in the open

`packages/evals` runs a seeded benchmark through the same engine the product uses. The first real-model run (Groq `openai/gpt-oss-120b`, 30 October 2026, 6 synthetic resumes, seed 42) is published on the [evaluation page](https://candidlens.vercel.app/evaluation) and in [`packages/evals/reports/`](packages/evals/reports):

| Metric             | Result                           | What it means                                                     |
| ------------------ | -------------------------------- | ----------------------------------------------------------------- |
| Direction accuracy | **29 / 30**                      | Agrees with the expected strong or weak call per criterion        |
| Self-consistency   | mean σ **2.3**                   | Score spread across 3 repeated runs; lower is better              |
| Position bias      | Kendall τ **0.87**               | 1.0 means the input order made no difference                      |
| Name-swap bias     | mean Δ **2.7**, **33 %** flagged | Score change when only the name changes; over 5 points is flagged |
| Rank agreement     | τ **1.0**                        | Overall ranking matches the expected order                        |

Six resumes is a small sample, and the name-swap result is a real weakness we are working on. CI runs a mock-model version of the harness on every pull request to check the plumbing; run the live one with your own key: `pnpm --filter @candidlens/evals run evals`.

## Configuration

Each package that needs secrets has a `.env.example` documenting every variable: the root `.env.example` for Docker Compose, plus `packages/db`, `apps/api` and `apps/web`. Settings used to be named `HIRELENS_*`; those names still work, and the `CANDIDLENS_*` name wins when both are set.

<details>
<summary><b>All settings</b></summary>

**Core**

| Variable                           | Purpose                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Postgres connection, e.g. `postgres://postgres:postgres@localhost:5433/hirelens`             |
| `BETTER_AUTH_SECRET`               | Signs sessions; at least 32 random characters (`openssl rand -base64 32`)                    |
| `BETTER_AUTH_URL`                  | The app's public address; sign-in callbacks and email links are built from it                |
| `TRUSTED_ORIGINS` / `CORS_ORIGINS` | Comma-separated origins allowed to start sign-in or call the API                             |
| `NEXT_PUBLIC_SITE_URL`             | Canonical address for the sitemap, robots and link previews                                  |
| `NEXT_PUBLIC_API_URL`              | Leave empty when the API runs inside the web app (Vercel); set it for a separate API service |
| `PORT`                             | API port when it runs on its own (default 4000)                                              |

**Sign-in**

| Variable                                                                | Purpose                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                             | Google sign-in; redirect URL `<origin>/api/auth/callback/google`              |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                             | GitHub sign-in; redirect URL `<origin>/api/auth/callback/github`              |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` / `NEXT_PUBLIC_GITHUB_OAUTH_ENABLED` | Show the matching button; set to `true` only when the server keys above exist |

**Email** (password reset, email confirmation, change of email)

| Variable                                            | Purpose                                                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANDIDLENS_SMTP_USER` / `CANDIDLENS_SMTP_PASSWORD` | SMTP sign-in; the defaults fit a Gmail account with an app password. Without them, development prints each email to the server log and production hides the email features |
| `CANDIDLENS_SMTP_HOST` / `CANDIDLENS_SMTP_PORT`     | Another provider (port 465 uses TLS; any other port must upgrade to TLS)                                                                                                   |
| `CANDIDLENS_MAIL_FROM`                              | Sender, e.g. `"CandidLens" <you@example.com>`                                                                                                                              |
| `NEXT_PUBLIC_EMAIL_ENABLED`                         | Only with a separate API service (Docker Compose): whether the web app offers the email features                                                                           |

**Models**

| Variable                                           | Purpose                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANDIDLENS_LLM_PROVIDER` / `CANDIDLENS_LLM_MODEL` | Turns on scoring: `google`, `anthropic`, `groq`, `openrouter`, `mistral`, `cerebras` or `ollama`, plus `_API_KEY` and `_BASE_URL`                                                        |
| `CANDIDLENS_LLM_FALLBACKS`                         | Failover chain, e.g. `groq,openrouter`, tried only when the primary is overloaded or rate-limited. Each fallback needs its own `CANDIDLENS_LLM_<ID>_MODEL` (and `_API_KEY`, `_BASE_URL`) |
| `CANDIDLENS_LLM_DEADLINE_MS`                       | Overall retry and failover budget (default 120000 ms, at most 600000) so a request can't outlive a serverless limit                                                                      |

**Observability** (all optional)

| Variable                                                            | Purpose                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `SENTRY_DSN`                                                        | Error tracking                                           |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` | Model tracing                                            |
| `NEXT_PUBLIC_POSTHOG_KEY`                                           | Product analytics: explicit events only, autocapture off |

On Vercel, changed variables reach only new deployments, so redeploy after editing them. If the database schema is behind the code, `/api/health?db=1` answers `503 migrations_pending` with the command to run.

</details>

## Deployment

The production site runs entirely on free tiers, chosen on purpose and listed so you can reproduce or audit them:

| Need                       | Service                                            | Why                                                                                                                             |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Web and API                | **Vercel** (Hobby)                                 | Next.js with a preview per pull request; the API runs inside the same deployment at `/api`, so sign-in cookies stay first-party |
| Database                   | **Neon** (Free)                                    | Serverless Postgres that scales to zero, with connection pooling and pgvector                                                   |
| Models                     | **Google Gemini** (free tier)                      | A generous free quota; any supported provider can take over through one setting                                                 |
| Email                      | **Gmail SMTP**                                     | A dedicated account with an app password; no paid domain needed                                                                 |
| Errors, analytics, tracing | **Sentry**, **PostHog**, **Langfuse** (free tiers) | Off until their keys are set                                                                                                    |
| CI                         | **GitHub Actions**                                 | Lint, typecheck, unit and database-backed integration tests, CodeQL and a secrets scan on every pull request                    |

Self-hosters use [Docker Compose](#self-host-in-one-command) instead: the same app on your own infrastructure.

## Built with

[Next.js](https://nextjs.org) · [Hono](https://hono.dev) · [Better Auth](https://www.better-auth.com) · [Drizzle ORM](https://orm.drizzle.team) · [PostgreSQL](https://www.postgresql.org) + [pgvector](https://github.com/pgvector/pgvector) · [Vercel AI SDK](https://ai-sdk.dev) · [Turborepo](https://turbo.build) + [pnpm](https://pnpm.io) · [Biome](https://biomejs.dev) · [Vitest](https://vitest.dev)

## How it compares

|                        | CandidLens                           | Commercial AI screeners | OpenATS           |
| ---------------------- | ------------------------------------ | ----------------------- | ----------------- |
| Open source            | ✅ MIT                               | ❌                      | ✅                |
| Self-host, local model | ✅                                   | ❌                      | ✅                |
| Score justification    | quoted evidence at character offsets | black box               | none (no scoring) |
| Bias auditing          | ✅ four-fifths report with export    | opaque                  | n/a               |
| Blind review           | ✅ identity masking, aligned quotes  | rare                    | ❌                |
| Cost                   | your own model key, or free locally  | per seat and per resume | free              |

## Documentation

| Guide                                                                                           | What's inside                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Quickstart](https://candidlens.vercel.app/docs/quickstart)                                     | A clean machine to the first scored candidate                       |
| [CLI](https://candidlens.vercel.app/docs/cli)                                                   | Every command                                                       |
| [Self-hosting](https://candidlens.vercel.app/docs/self-hosting)                                 | Docker Compose, settings, backups, upgrades                         |
| [Resume Doctor](https://candidlens.vercel.app/docs/resume-doctor)                               | What it checks and how the score works                              |
| [Accounts and sign-in](https://candidlens.vercel.app/docs/accounts-and-sign-in)                 | Sign-in methods, password reset, email changes, deleting an account |
| [ATS integration](https://candidlens.vercel.app/docs/ats-integration)                           | API tokens, webhooks, CSV round-trip and the CLI                    |
| [Configuration](https://candidlens.vercel.app/docs/configuration)                               | Every setting, grouped by what it turns on                          |
| [Blind review and bias audits](https://candidlens.vercel.app/docs/blind-review-and-bias-audits) | What is masked, decision reasons, and the adverse-impact audit      |
| [API reference](https://candidlens.vercel.app/api-reference)                                    | Routes, authentication, roles and the OpenAPI contract              |
| [Evaluation harness](https://candidlens.vercel.app/evaluation)                                  | The metrics and how to run them                                     |
| [Architecture](ARCHITECTURE.md)                                                                 | How the pieces fit, and why                                         |
| [Troubleshooting](docs/project_execution.md#8-troubleshooting--real-errors-real-fixes)          | Real errors from development, with fixes                            |

## Roadmap

- **Released, v1.4.0 (6 October 2026):** talent-pool rediscovery, the public parser API and the format check. Earlier releases brought blind review, the bias audit, teams and sharing, interview kits, the candidate portal and candidate reports. Full history in the [changelog](CHANGELOG.md).
- **On `main`, planned for v1.5.0:** the Resume Doctor, multi-provider failover, a full account lifecycle (passwords, reset, email confirmation, change of email, deletion) and the CandidLens rename. See [Unreleased](CHANGELOG.md#unreleased).
- **Next:** the v1.5.0 release under the new name (npm, Docker images, repository), then internationalization, SSO and finer-grained roles. Details on the [roadmap page](https://candidlens.vercel.app/roadmap).

Every feature in this README exists on `main` today and is covered by tests.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), or pick up an [open issue](https://github.com/abhay-yemekar/candidlens/issues).

**Security:** please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

**Privacy:** resumes are personal data. Never commit real resumes, know where your candidate data lives, and use local Ollama mode when resumes must not leave your infrastructure.

## Built by

CandidLens is created and maintained by **[Abhay Yemekar](https://github.com/abhay-yemekar)** · [LinkedIn](https://www.linkedin.com/in/abhayyemekar/). Questions or feedback? [Open an issue](https://github.com/abhay-yemekar/candidlens/issues) or reach out on LinkedIn.

<div align="center">

**[Try the demo](https://candidlens.vercel.app/demo)** · **[Star the repo](https://github.com/abhay-yemekar/candidlens)** · **[Report a bug](https://github.com/abhay-yemekar/candidlens/issues/new/choose)**

[MIT License](LICENSE)

</div>
