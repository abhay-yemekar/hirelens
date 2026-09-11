# HireLens

**See why, not just who.**

The open-source, glass-box hiring intelligence platform. Rank candidates against a job with evidence-linked scores, rubric transparency, and built-in bias auditing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11-FC6D26)](https://pnpm.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Status: engine-first build, pre-v1.0.** The core engines (extraction, parsing, rubric, scoring, orchestration) are built and tested; the product UI is being built on top of them. This README describes what exists **today** — for a step-by-step local run guide with troubleshooting, see [`docs/project_execution.md`](docs/project_execution.md).

---

## What works today

A pnpm + Turborepo monorepo with the full scoring pipeline as tested packages:

1. **Extract** — PDF (unpdf), DOCX (mammoth), TXT/MD; magic-byte sniffing; scanned-PDF detection that refuses sparse PDFs instead of returning garbage.
2. **Parse** — deterministic heuristic parser → typed, Zod-validated `Candidate` record (JSON-Resume-compatible): sections, contact, profiles, date ranges.
3. **Rubric** — paste a job description, get 5–8 weighted criteria with an anchored 0–5 scale; recruiter reviews/edits before any scoring runs. Versioned, forkable, exportable JSON.
4. **Score** — rubric + resume → per-criterion 0–5 with **evidence spans (exact character offsets in the document)**, confidence, rationale; never a naked number.
5. **Batch orchestration** — fan-out scoring across a job's candidates with bounded concurrency, retries, hash-chained audit records, and live progress.
6. **API** — authenticated (Better Auth), org-scoped REST surface over all of it: jobs, versioned rubrics, candidate upload (single + ZIP), scoring, run history.
7. **Web app** — sign-in/up, org onboarding, jobs, candidate upload, scoring kickoff, ranked review queue (advance/shortlist/reject with required reasons, keyboard loop, blind review, CSV/JSON export), the evidence viewer (click a criterion → the resume scrolls and flashes the exact span), and a one-click **bias audit report** (four-fifths rule, per-group selection rates, export).
8. **Eval harness** — seeded benchmark measuring direction accuracy, self-consistency, position bias, and name-swap bias (see the numbers below).

Everything is model-agnostic: bring your own key (Google, Anthropic, Groq, OpenRouter) or run fully local via **Ollama** — resumes never have to leave your machine.

## Repository layout

```
apps/
  web/            Next.js product UI (being built on the design system)
  api/            Hono server — auth, jobs, rubrics, candidate upload, scoring
  cli/            hirelens CLI (npx hirelens)
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

Prereqs: **Node 20+**, **pnpm 11**, **Docker** (for Postgres + pgvector).

```bash
git clone https://github.com/abhay-yemekar/hirelens.git
cd hirelens
pnpm install
docker compose up -d                      # Postgres 16 + pgvector on :5433
cp packages/db/.env.example packages/db/.env
pnpm --filter @hirelens/db db:migrate     # create tables
pnpm test                                 # 89 tests incl. DB-backed integration
```

UI: `pnpm --filter @hirelens/ui storybook` → http://localhost:6006 (design-system playground).

The detailed walkthrough — every command, what it does, expected output, and a troubleshooting table built from real failures — is in **[docs/project_execution.md](docs/project_execution.md)**.

## Configuration

One `.env` per package that needs secrets, with `.env.example` documenting every variable: `packages/db/.env.example` (DATABASE_URL, Better Auth, OAuth) and `apps/api/.env.example` (DATABASE_URL, port, LLM).

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (local: `postgres://postgres:postgres@localhost:5433/hirelens`) |
| `BETTER_AUTH_SECRET` | Better Auth secret — generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | App URL for auth callbacks (default `http://localhost:3000`) |
| `GITHUB_CLIENT_ID` / `_SECRET`, `GOOGLE_CLIENT_ID` / `_SECRET` | Optional social login |
| `HIRELENS_LLM_PROVIDER` + `HIRELENS_LLM_MODEL` (+ `_API_KEY`) | Enables LLM routes in the API (google/anthropic/groq/openrouter/ollama) |
| `PORT` | API port (default 4000) |

## Evaluation harness — an unevaluated ranker is a liability

`packages/evals` runs a seeded synthetic benchmark (6 resumes × 5 criteria, seed 42) through the **same scoring engine the product uses**, and reports four metrics:

- **Direction accuracy** — agreement with expected strong/weak per criterion
- **Self-consistency** — score variance across repeated runs of the same resume (lower is better)
- **Position bias** — Kendall τ between rank orderings when input order is shuffled (1.0 = order-invariant)
- **Name-swap bias** — score movement when only the name changes (0 = invariant); any movement above 5 points is flagged

Latest numbers (offline mock-model run — validates the harness plumbing; live-model numbers are generated with `pnpm --filter @hirelens/evals run evals` and a billing-enabled key, then committed as `eval-report.json`):

| Metric | Value |
|---|---|
| Accuracy (vs. mock expectation) | 14/30 · 0.47 |
| Self-consistency (mean σ) | 0.0 |
| Position bias (mean τ) | 1.0 |
| Name-swap bias (mean Δ) | 0.0 (0 flagged) |
| Rank agreement (τ vs. expected order) | 1.0 |

Run it yourself: `pnpm --filter @hirelens/evals run evals:mock` (offline) or `evals` (live, needs `HIRELENS_LLM_*` in `apps/api/.env`). The unit suite in `packages/evals` runs in CI on every PR.

## Why glass-box

Most hiring AI is a black box: a number with no justification. That is a liability — for candidates, for recruiters, and under emerging regulation. HireLens is built around a different contract: **every score must link to the exact evidence that produced it.** The scoring engine already stores the evidence spans; the UI that surfaces them is next.

## Comparison

| | HireLens | Commercial AI screeners | OpenATS |
|---|---|---|---|
| Open source | ✅ MIT | ❌ | ✅ |
| Self-host / local LLM mode | ✅ | ❌ | ✅ |
| Score justification | evidence spans with character offsets | black box | none (no AI) |
| Bias auditing | ✅ four-fifths-rule report with export | opaque | n/a |
| Modern UX | being built on the design system | ✅ | ❌ |

## Roadmap to v1.0.0 — 30 September 2026

Remaining per the master plan (§11):

- **Product UI** — jobs, rubric editor, candidate table, and the **evidence viewer**: click a criterion → the resume scrolls and flashes the exact quoted span.
- **RAG Q&A** — chunking, pgvector embeddings, hybrid retrieval for resume chat.
- **Bias audit** — adverse-impact metrics (four-fifths rule, selection-rate ratios) exportable as a report.
- **Blind review** — one toggle masks name, photo, address, school, graduation year.
- **Self-host** — `docker compose up` for the full stack, plus `npx hirelens` beyond version/help.

Follow along in [Issues](https://github.com/abhay-yemekar/hirelens/issues).

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md). **Do not open a public issue for security reports.**

## A note on privacy

Resumes are personal data. Never commit real resumes to git, always know where your candidate data is stored, and use the local Ollama mode if resumes must not leave your infrastructure. HireLens itself never phones home.

## License

[MIT](LICENSE)
