# Changelog

All notable changes to HireLens are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Interview kits** — printable debrief pack per scored candidate: probe
  questions derived from the rubric's anchored 0–5 scale, awarded/next-level
  anchors, and the evidence quotes as a listen-for list. JSON + standalone
  HTML; deterministic (no extra LLM call); exports are audit-logged.
- **Candidate portal** — one-shot, token-gated links (`/portal/[token]`) let
  candidates opt in to a demographics self-report without an account. The
  page states the data policy before any input; submissions feed the same
  isolated demographics table the bias audit reads; create/submit/revoke are
  hash-chain audited; links revoke instantly and never replay after submit.
- **API surface** — four new endpoints documented in the live OpenAPI 3.1
  contract (kit JSON/HTML export, portal create/revoke, public invite/submit).

### Changed

- Roadmap and README updated: the four post-launch waves (recruiter
  essentials, semantic search + rubric editor + compare view, teams &
  sharing, interview kits + portal) are shipped and documented.

## [1.0.0] — 2026-09-18

First public release. 🎉

### Added

- **AI resume screening that shows its work** — every 0–5 criterion score
  carries a quoted snippet from the resume as evidence, combined into an
  overall /100 with per-criterion breakdown.
- **Review queue** — ranked candidates with score, stage (New / Shortlisted /
  Advanced / Rejected), and one-click decisions; every decision recorded in an
  audit log with a required reason.
- **Blind review mode** — hide candidate names while deciding, reveal after.
- **Bias audit** — four-fifths (80%) selection-rate check across reported
  gender groups, with a downloadable report.
- **Scoring integrity** — rate-limit-aware retries, persisted per-candidate
  failures, "Retry failed" action, and a results banner that names exactly who
  failed and why. Failed candidates are never silently dropped.
- **Bulk upload** — individual resumes (PDF, TXT, MD) or a ZIP with many
  resumes; duplicates skipped automatically; unreadable files reported, not
  hidden.
- **Multi-tenant organizations** with Better Auth (email + Google + GitHub
  sign-in), first-party cookies, same-origin API mount.
- **CLI** (`npx hirelens`) — login, orgs, jobs, rubric derivation from a JD,
  folder upload + scoring with `--json` machine output.
- **Marketing site** — product tour, live demo with seeded data, docs, FAQ,
  Privacy / Cookies / Terms pages; accessible (axe-clean) and SEO-complete.
- **Self-host** — `docker compose up` (web + API + pgvector Postgres); images
  published to GHCR per release.
- **Observability, opt-in** — Sentry errors, PostHog product analytics
  (explicit events only, autocapture off), Langfuse LLM tracing. Nothing
  phones home until the operator sets the keys.
- **CI** — lint, typecheck, unit + integration tests against a real Postgres
  (fail loudly on CI, never silently skip), build, secrets scan, CodeQL.

### Platform

- Free-tier friendly deployment: Vercel (Hobby), Neon Postgres + pgvector,
  Google Gemini free tier as the default LLM.
- MIT licensed. Resumes never have to leave the operator's machine.

[1.0.0]: https://github.com/abhay-yemekar/hirelens/releases/tag/v1.0.0
