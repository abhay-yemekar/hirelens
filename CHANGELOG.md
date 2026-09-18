# Changelog

All notable changes to HireLens are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

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
