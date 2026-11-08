# Changelog

All notable changes to HireLens are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/).

## [Unreleased]

On `main` since v1.4.0; planned for v1.5.0.

### Added

- **Change email and delete account** — Settings → Sign-in & security can
  change your sign-in email through a link sent to the new address,
  confirmed while signed in; the old address gets a notice. Settings →
  Delete account shows what happens to each organization, then erases the
  ones only you belong to, refuses while you are the only owner of a
  shared one (Members can now make someone an owner), and leaves the
  rest. Your name, email, sign-in methods and sessions are removed; the
  audit log keeps an anonymous id so shared audit chains still verify
  (#162).
- **Forgot password and email confirmation** — "Forgot password?" emails a
  one-time link (valid 1 hour) to choose a new password; it also gives an
  account made with Google or GitHub its first password, and signs the
  account out everywhere. Sign-up emails a link to confirm the address,
  and Settings can send it again. Email goes out over SMTP (a Gmail app
  password works; see `CANDIDLENS_SMTP_*` in `.env.example`), capped per
  address per hour and per kind per day (#162).

- **Resume Doctor** (`/doctor`) — deterministic resume checks (contact,
  structure, dates, impact, brevity, parseability) with a 0–100 score and
  every flag pinned to the exact line. No model involved: the same text
  always gets the same report. Candidates use it without an organization;
  inside one, score history is kept (only a hash of the text is stored).
  Accepts pasted text or a PDF, Word, .txt or .md file (#129, #148).
- **Multi-provider AI** — a failover chain (`HIRELENS_LLM_FALLBACKS`) that
  serves from the next provider on transient failures, retry with backoff
  on overload and rate limits, Mistral and Cerebras as providers, and an
  owner-only per-organization provider setting with a connection test
  (#106, #107).
- **Settings → Sign-in & security** — see which ways you can sign in,
  add a password to an account made with Google or GitHub, change or
  remove your password, connect or disconnect Google and GitHub (one way
  to sign in always stays), and sign out other devices. The sign-in and sign-up forms
  now say when an email belongs to a Google or GitHub account and where to
  add a password (#162).
- **Talent pool: add to job** — re-ingest a rediscovered candidate into any
  open job, audited (#100).
- **First real-model eval run** published on `/evaluation`: Groq
  `gpt-oss-120b`, 29/30 direction accuracy with its 95% interval (#137).

### Changed

- The README, docs and repository files describe CandidLens: a new front
  page with the product shot, features by audience, a how-it-works
  diagram, the real-model evaluation numbers and a complete settings
  reference (#173).
- Every password field has a show/hide button. Sign-up says passwords
  need 8 characters, and messages in Settings → Sign-in & security show
  next to the part of the card they belong to (#164).
- **HireLens is now CandidLens.** The app, the site, the link-preview
  image and the API's name use the new name, with a "formerly HireLens"
  note in the site footer. The CLI and Docker images keep their names
  until their next release.
- Settings are renamed from `HIRELENS_*` to `CANDIDLENS_*` for the
  CandidLens rename. The old names still work, so existing deployments and
  `.env` files need no changes; when both are set, the new name wins.
- The landing page's product shots render from a recorded real-model run
  over the demo resumes, so every number comes from the engine (#144).
- `/api/health?db=1` compares applied migrations with the checked-in
  journal and reports what is missing; the hosted app serves non-LLM routes
  when the LLM configuration is invalid instead of failing every route
  (#107, `4ed4514`, `ee358b4`).
- Provider and schema failures return a typed `502` with the provider's
  reason, and internal errors carry a correlation `errorId` (#104).
- Vercel preview builds no longer run migrations against the production
  database unless `MIGRATE_ON_PREVIEW=1` (#139).
- Dependency updates: Next.js 16.4.3, Biome 2.6.3, motion 14, Sentry 11,
  dotenv 18 and a grouped minor/patch update (#90, #91, #99, #108, #116,
  #118).

### Fixed

- The Resume Doctor said "No experience section detected" when role lines
  used en or em dashes (`Engineer—Acme  Mar 2021 – Present`); they now
  parse, and a found Experience heading with no readable roles says
  "Couldn't read your roles" instead. "Table-style layout" no longer fires
  for pipes in contact headers or skill lists, only for rows framed by
  pipes or 3+ stacked rows of the same shape. Employment dates no longer
  read a company that starts like a month ("Marriott 2019") as a month,
  and long month-like text no longer slows parsing (#167).
- The public parse API says the roles couldn't be read when the
  Experience heading is there, instead of "No experience section
  detected." Labelled lines under a role (`Stack: Python | Airflow`) are
  no longer read as roles, and education lines separated by en or em
  dashes give the right institution (#170).
- Evidence quotes written with a different hyphen, dash or quote
  character than the resume were not found, so their scores were
  withheld (#143).
- Groq's strict structured output rejected the scoring and rubric schemas
  (#135); Google's schema rejection now falls back to JSON-text mode
  (#105).
- The eval harness ranked the reversed position-bias pass by the first
  pass's scores, so Kendall's τ was always 1 (#132).
- The audit-log export verifies full chain linkage and covers the actor;
  appends are serialized per organization (#102).
- Blind review is enforced at scoring time (`4ed4514`).
- Public pages render for crawlers before the client theme loads (#103).

### Security

- Google or GitHub no longer joins an existing account just because the
  email matches; connect them from Settings → Sign-in & security while
  signed in. Otherwise someone could register a stranger's email first
  and share the account once its owner signed in with Google (#162).
- Next.js 16.4.3 closes critical framework advisories (#116).
- The ATS webhook's resume fetch is limited to public HTTPS hosts, with
  every redirect re-checked and a streamed size cap (#125).
- Revoking portal and candidate-report links is scoped to the caller's
  organization (#120); analytics decision reads are scoped likewise (#122).
- The API loads `.env` before the auth configuration, and production
  refuses a missing, short or placeholder `BETTER_AUTH_SECRET` (#127).

## [1.4.0] — 2026-10-06

### Added

- **Application tracker (candidate side)** — `/tracker`: candidates track
  their applications (role, company, status, notes and their self-check
  score), stored on their device only and exportable as CSV (#87).
- **ATS format check (v1.4 milestone 3)** — a deterministic parse simulation
  that asks "what will an ATS/parser make of this resume?" before anyone
  spends a scoring run. The checker (pure function in core, same text the
  scoring pipeline reads) reports a `pass | warn | fail` verdict, a 0–100
  score, and actionable findings across four groups: text layer (scanned
  pages, near-empty pages), layout (table/pipe rows, multi-column
  fragments, low text density), encoding (mojibake), and structure (no
  email/phone/experience/skills detected, nothing parseable). Stored at
  ingest on the document, surfaced on the candidate page as the **ATS
  format check** card, and returned by `POST /api/public/parse` as
  `formatCheck` so integrations can drop or fix mangled resumes before
  ingesting.
- **Public parser API** — `POST /api/public/parse`: stateless resume parsing
  for integrations. Send a multipart file (txt/md/pdf/docx) or raw text with
  an org API token (same `hl_…` credentials as the ATS webhook — create them
  in Settings → Integrations) and get back the JSON-Resume-compatible
  profile, a SHA-256 content hash for dedupe, language, page count, and
  layout warnings. Nothing is stored server-side. Rate limited per token
  (default 60 requests/minute, `429` + `Retry-After`); rate limit is
  tunable via `HIRELENS_PARSE_RATE_LIMIT`.
- **Talent-pool rediscovery (recruiter side)** — one search across every
  candidate in every job in your workspace. Filter by identity (filename,
  email, phone), skills (facet chips with counts, from the parsed resume —
  falling back to full-text extraction), latest decision stage, and a
  minimum rubric-weighted overall score (0-100, same formula the run pages
  use). **Shortlist** records a regular, required-reason decision on the
  candidate's own job, so rediscovered people land in review, analytics,
  and bias audits with the rest of the pipeline. Blind review is honored:
  `?blind=1` masks identity cues and drops the identity filter. The API
  surface is `GET /api/talent-pool` + `POST /api/talent-pool/shortlist`,
  fully specified in the OpenAPI document. Reached from the header
  ("Talent pool") or the quiet link on the Jobs page; recruiter side only.

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
