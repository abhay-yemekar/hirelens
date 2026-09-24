# Changelog

All notable changes to HireLens are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

## [1.2.0] — 2026-09-24

The candidate-side release: HireLens now serves both sides of hiring at
equal level, plus the recruiter depth that matches it.

### Added — candidate side

- **Self-check (free, no account)** — paste a resume + any job description,
  get evidence-backed scores against a real rubric in seconds; heuristic
  fallback keeps it honest without an LLM key.
- **Candidate reports** — a recruiter generates a per-candidate link; the
  candidate sees their own outcome (per-criterion scores, exact evidence
  quotes, anchored scale) and never anyone else's data. Token = credential,
  shown once, revocable, read-counted, hash-chain audited.
- **Candidate report center** — reports you open are remembered on your
  device only (clearable, nothing server-side), matching the privacy pitch.
- **Dual-side product** — one-time track chooser after signup (recruiter or
  candidate), sign-in routes to your side, and Settings → Account switches
  sides anytime.

### Added — recruiter side

- **Skill-graph adjacency** — matched / adjacent / missing skills computed
  from the parsed resume against JD-derived targets, with an explicit query
  override for custom searches.
- **Semantic Search & Ask** — pgvector KNN over a job's resumes with keyword
  fallback, plus cited LLM answers verified server-side against the
  retrieved chunk set.
- **Analytics dashboard** — read-only org aggregates: pipeline stages, score
  distributions, decision speed, bias snapshot trends.
- **Scheduled bias audits** — cron snapshots per job (four-fifths ratio,
  selection rates, parity difference) with org-level trend charts.
- **AI-content detection** — deterministic (no LLM) suspicion scoring with
  per-signal reasons, so recruiters can probe authenticity in interview.
- **ATS integration** — `POST /api/webhooks/ats` with SHA-256-hashed bearer
  API tokens (Settings → Integrations), HTTPS-only, replay-safe; the
  integration guide documents a real endpoint.
- **Rubric library** — 8 curated role presets with one-click import into any
  job's rubric editor.
- **Candidate ops** — contact extraction (email/phone columns), original
  resume viewing, pagination + search, org/job editing and archiving,
  members/roles/invites, audit CSV export.
- **Public share links** — once-only read-only run reports with title,
  read counts, and instant revocation.

### Changed

- Design-token bridge hoisted to `:root` — marketing-layout pages
  (self-check, track chooser) render true brand colors.
- Account chip in the product nav: side-aware "My hub / Open workspace",
  explicit path back to the website.
- Demo GIF regenerated against production (real `gemini-2.5-flash` badge).

## [1.1.0] — 2026-09-20

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
