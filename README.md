# HireLens

**See why, not just who.**

The open-source, glass-box hiring intelligence platform. Rank candidates against a rubric you control — with evidence-linked scores, tamper-evident audit trails, blind review, and built-in adverse-impact reporting.

**[▶ Try the live demo — no signup](https://hirelens.demo/demo)** · [📖 Documentation](#documentation) · [⚡ Self-host in one command](#quickstart)

[![CI](https://github.com/abhay-yemekar/hirelens/actions/workflows/ci.yml/badge.svg)](https://github.com/abhay-yemekar/hirelens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11-FC6D26)](https://pnpm.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Status: feature-complete for v1.0.0 (target 30 September 2026).** Hardening, private beta, and launch polish remain — see the [roadmap](#roadmap-to-v100--30-september-2026). Every feature in this README exists on `main` today, verified by tests.

---

## What works today

A pnpm + Turborepo monorepo shipping the full product:

1. **Extract** — PDF (unpdf), DOCX (mammoth), TXT/MD; magic-byte sniffing; scanned-PDF detection that refuses sparse PDFs instead of returning garbage.
2. **Parse** — deterministic heuristic parser → typed, Zod-validated `Candidate` record (JSON-Resume-compatible).
3. **Rubric** — paste a job description, get 5–8 weighted criteria with an anchored 0–5 scale; recruiter reviews/edits before any scoring runs. Versioned, forkable, exportable JSON.
4. **Score** — rubric + resume → per-criterion 0–5 with **evidence spans (exact character offsets in the document)**, confidence, rationale; never a naked number.
5. **Batch orchestration** — fan-out scoring with bounded concurrency, retries, hash-chained audit records, and live progress.
6. **Product UI** — sign-in/up, org onboarding, jobs, ranked review queue (advance/shortlist/reject with required reasons), the **evidence viewer** (click a criterion → the exact quoted span lights up), and **blind review** (identity cues masked with offsets preserved).
7. **Bias audit** — one-click adverse-impact report: per-group selection rates, the EEOC four-fifths rule, demographic parity difference, JSON export. Opt-in self-reported demographics only.
8. **Audit log** — immutable, hash-chained; tampering breaks the chain visibly.
9. **API** — authenticated (Better Auth), org-scoped REST surface with a live **OpenAPI 3.1** contract at `GET /api/openapi.json`.
10. **CLI** — `hirelens login / org / jobs / rubric derive / score` — the whole pipeline from a terminal, zero runtime dependencies.
11. **Self-host** — `docker compose up --build -d` brings up web + API + Postgres with migrations applied automatically.
12. **Observability** — structured logging always on; Sentry, Langfuse LLM tracing, and privacy-first PostHog behind env flags.
13. **Eval harness** — seeded benchmark measuring direction accuracy, self-consistency, position bias, and name-swap bias, wired into CI ([numbers below](#evaluation-harness--an-unevaluated-ranker-is-a-liability)).

Everything is model-agnostic: bring your own key (**Google, Anthropic, Groq, OpenRouter**) or run fully local via **Ollama** — resumes never have to leave your machine. Providers that reject complex JSON schemas (e.g. Gemini's nested-array limits) are handled automatically by a validated JSON-text fallback.

## Live demo — no signup

The landing page's [/demo](apps/web/app/demo/page.tsx) runs the **same scoring engine, rubric schema, and evidence-span machinery as the product** against 12 synthetic resumes and one sample JD:

- Pick a resume, press score, watch per-criterion scores arrive with rationales.
- Every point highlights the exact quoted text it came from — at its exact character offset.
- With an LLM key configured, scoring is real; without one, a deterministic heuristic fallback keeps the demo honest and functional.
- Rate-limited per IP (20 runs/hour) and globally; results cached.

<!-- TODO(launch): replace with a real product GIF per the master plan §9. -->

## Documentation

The [docs site](apps/docs) (Fumadocs) builds with the repo:

| Page | Contents |
|---|---|
| [Quickstart](docs/project_execution.md) | Clean machine → first scored candidate, with expected output |
| [CLI](docs/project_execution.md#6-run-the-applications) | Full command reference |
| [Self-hosting](apps/docs/content/docs/guides/self-hosting.mdx) | Docker Compose, env vars, backups, upgrades |
| [Blind review & bias audits](apps/docs/content/docs/guides/blind-review-and-bias-audits.mdx) | Methodology and what we deliberately don't do |
| [API reference](apps/docs/content/docs/reference/api.mdx) | The OpenAPI contract and auth flow |
| [Evaluation harness](apps/docs/content/docs/reference/evaluation-harness.mdx) | Metrics and how to run them |
| [Troubleshooting](docs/project_execution.md#8-troubleshooting--real-errors-real-fixes) | Real errors from development, with fixes |

## Repository layout

```
apps/
  web/            Next.js product UI + marketing landing + /demo
  api/            Hono server — auth, jobs, rubrics, upload, scoring, audits
  cli/            hirelens CLI (zero-dep TypeScript)
  docs/           Fumadocs documentation site
packages/
  core/           THE PRODUCT. Framework-free engines:
                    extract/ parse/ rubric/ score/ evidence/ llm/ audit/ zip/ dedupe/
  db/             Drizzle schema + migrations (Postgres + pgvector)
  orchestrator/   Batch scoring fan-out → DB, hash-chained audit log
  ui/             Design system — OKLCH tokens, components, Storybook
  evals/          Benchmark dataset + accuracy/consistency/bias harness
  config/         Shared tsconfig / biome preset
```

## Quickstart

**60-second self-host** (Docker only):

```bash
git clone https://github.com/abhay-yemekar/hirelens.git && cd hirelens
cp .env.example .env                # set BETTER_AUTH_SECRET
docker compose up --build -d        # web :3000 · api :4000 · postgres :5433
```

Migrations apply on first boot. Open [localhost:3000](http://localhost:3000), create an account and organization, add an LLM key in `.env` for scoring.

**Development setup** (Node 20+, pnpm 11, Docker):

```bash
pnpm install
docker compose up -d                      # Postgres 16 + pgvector on :5433
cp packages/db/.env.example packages/db/.env
pnpm --filter @hirelens/db db:migrate     # create tables
pnpm test                                 # full suite incl. DB-backed integration tests
pnpm --filter @hirelens/web dev           # product UI on :3000
pnpm --filter @hirelens/api dev           # API on :4000
pnpm --filter @hirelens/docs dev          # docs site on :3002
```

The detailed walkthrough — every command, expected output, and a troubleshooting table built from real failures — is in **[docs/project_execution.md](docs/project_execution.md)**.

### CLI

With the API running:

```bash
pnpm --filter @hirelens/cli dev login you@example.com
cd apps/cli && node src/main.ts jobs create "Senior Backend" --jd jd.md
cd apps/cli && node src/main.ts rubric derive <jobId>      # LLM JD → rubric
cd apps/cli && node src/main.ts score <jobId> ./resumes/   # upload + score + ranked table
```

`score` uploads every `.txt/.md/.pdf` in the path and prints a ranked table (`--breakdown` for per-criterion evidence, `--json` for machines). Sessions persist to `~/.hirelens/`. Requires Node ≥ 22.6.

### API contract

The full public API is described by an **OpenAPI 3.1** document served live at [`GET /api/openapi.json`](apps/api/src/openapi.ts) — every mounted route, shapes, the error envelope, and auth. A CI test fails if a route ships without a spec entry.

## Configuration

One `.env` per package that needs secrets, with `.env.example` documenting every variable: `packages/db/.env.example`, `apps/api/.env.example`, `apps/web/.env.example`, and the root `.env.example` for the self-host stack.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (local: `postgres://postgres:postgres@localhost:5433/hirelens`) |
| `BETTER_AUTH_SECRET` | Better Auth secret — generate: `openssl rand -base64 32` |
| `HIRELENS_LLM_PROVIDER` + `HIRELENS_LLM_MODEL` (+ `_API_KEY`, `_BASE_URL`) | Enables LLM routes (google/anthropic/groq/openrouter/ollama) |
| `SENTRY_DSN` | Error tracking (optional) |
| `LANGFUSE_PUBLIC_KEY` / `_SECRET_KEY` / `_BASE_URL` | LLM tracing (optional) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics — explicit events only, autocapture off (optional) |
| `PORT` | API port (default 4000) |

## Evaluation harness — an unevaluated ranker is a liability

`packages/evals` runs a seeded synthetic benchmark through the **same scoring engine the product uses**, and reports four metrics:

- **Direction accuracy** — agreement with expected strong/weak per criterion
- **Self-consistency** — score variance across repeated runs (lower is better)
- **Position bias** — Kendall τ between rank orderings when input order is shuffled (1.0 = order-invariant)
- **Name-swap bias** — score movement when only the name changes (0 = invariant); movement above 5 points is flagged

Latest committed numbers (`packages/eval-report.json`, offline mock-model run — validates the harness plumbing; regenerate live with `pnpm --filter @hirelens/evals run evals` and a billing-enabled key):

| Metric | Value |
|---|---|
| Accuracy (vs. mock expectation) | 14/30 · 0.47 |
| Self-consistency (mean σ) | 0.0 |
| Position bias (mean τ) | 1.0 |
| Name-swap bias (mean Δ) | 0.0 (0 flagged) |
| Rank agreement (τ vs. expected order) | 1.0 |

Run it yourself: `pnpm --filter @hirelens/evals run evals:mock` (offline, CI) or `evals` (live). The unit suite runs on every PR.

## Why glass-box

Most hiring AI is a black box: a number with no justification. That is a liability — for candidates, for recruiters, and under emerging regulation (NYC LL144, EU AI Act). HireLens is built around a different contract: **every score must link to the exact evidence that produced it**, every decision requires a stated reason, and anyone with viewer access can run an adverse-impact audit. An AI score is a screening aid, not a hiring decision.

## Comparison

| | HireLens | Commercial AI screeners | OpenATS |
|---|---|---|---|
| Open source | ✅ MIT | ❌ | ✅ |
| Self-host / local LLM mode | ✅ | ❌ | ✅ |
| Score justification | evidence spans with character offsets | black box | none (no AI) |
| Bias auditing | ✅ four-fifths-rule report with export | opaque | n/a |
| Blind review | ✅ identity masking with aligned spans | rare | ❌ |
| Modern UX | ✅ | ✅ | ❌ |
| Cost | your own LLM key | per-seat + per-resume fees | free |

## Roadmap to v1.0.0 — 30 September 2026

- **Hardening** — rate limiting, deeper input validation, a11y pass, load test a 200-resume batch.
- **Private beta** — 5–10 real recruiters; fix what they actually hit; feature freeze.
- **Launch** — tag `v1.0.0`, GitHub Release, multi-arch GHCR images, `npx hirelens` on npm.
- **Post-launch** — RAG Q&A over resumes (pgvector embeddings + hybrid retrieval — the schema ships today), rubric editor UI, compare view, scheduled audits.

Follow along in [Issues](https://github.com/abhay-yemekar/hirelens/issues).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md). **Do not open a public issue for security reports.**

## A note on privacy

Resumes are personal data. Never commit real resumes to git, always know where your candidate data is stored, and use the local Ollama mode if resumes must not leave your infrastructure. HireLens itself never phones home — observability integrations are opt-in via env vars.

## License

[MIT](LICENSE)
