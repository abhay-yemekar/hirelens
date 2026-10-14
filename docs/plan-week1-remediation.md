# Week-1 plan from the external code review

Scope: the review's "Gaps in the fixes" (#1–#5), the `<mark>` colour, and
enforcing blind review in scoring. Later weeks (Resume Doctor, triage UI,
integrations) are tracked separately.

## Gap 1 — Health check can't detect "behind by N" (partially-migrated DB passing as healthy)

**Current state:** `apps/api/src/app.ts` health route only checks
`count(*) = 0` on `drizzle.__drizzle_migrations`. A DB with 11 of 13
migrations applied (exactly the incident prod had) reports `ok: true`.

**Fix:** drizzle's migrator inserts each applied migration with
`created_at = journal entry's when` (millisecond epoch, bigint column).
So the applied state is exactly comparable to `drizzle/meta/_journal.json`:

1. Generate a checked-in snapshot: `packages/db/scripts/gen-migration-snapshot.mjs`
   reads `_journal.json` and writes `packages/db/src/migration-snapshot.ts`
   exporting `MIGRATION_SNAPSHOT: ReadonlyArray<{ tag: string; when: number }>`.
   Re-run after every `drizzle-kit generate`; committed so the runtime never
   needs fs access (serverless bundle can't rely on reading the folder).
2. New pure helper `apps/api/src/migration-health.ts`:
   `compareMigrations(applied: number[], expected: string-tag rules)` →
   `{ behindBy, missingTags, unknown }`.
3. Health `?db=1` compares applied timestamp set vs snapshot:
   - `behindBy > 0` → 503 `migrations_pending: true` with
     `missing: [{ tag }]` (up to 5 shown) naming the exact migration to run.
   - applied rows whose `when` isn't in the journal → `unknown: n`, reported
     as a warning (ok stays true — e.g. a self-hoster edited state on
     purpose; but visibly flagged).
   - exact match → `ok: true`.

## Gap 2 — Production migrations are manual

**Current state:** `db:migrate` in `ci.yml` targets the CI test database
only. Prod relies on someone hand-running the command (the source of the
journal desync we just repaired).

**Fix:** `apps/api/scripts/deploy-migrate.mjs` — if `DATABASE_URL` is set
(and not the local compose default used by fresh dev checkouts), runs
`packages/db` migrate in a child process; if unset, logs "skipping
(no DATABASE_URL at build time)" and exits 0. Wired into
`apps/web` build: `deploy-migrate && build-embed && next build`, so every
Vercel deploy applies pending migrations before the new code ships.
Idempotent by construction (drizzle skips journaled migrations).

## Gap 3 — Degrade mode hides the reason

**Current state:** on Vercel a bad `HIRELENS_LLM_*` config is swallowed in
`vercel.ts`; LLM routes answer the generic `llm_not_configured`
("needs an LLM key") even though a key exists but is misconfigured.
Nothing tells the operator what's wrong.

**Fix:**
- `AppDeps` gains `llmConfigError?: string | null`; `vercel.ts` captures
  `readLlmEnv()`'s message into it (these messages are ours — env-var
  names and required settings — so they're safe to surface, secrets never
  enter them).
- createApp stashes it on context; `/api/health?db=1` reports
  `llm: { configured, configError }`.
- Settings `GET /llm` returns `llmConfigError`; the AI-providers card
  renders it as a warning banner above the provider list.
- New guard helper `llmUnavailableResponse(c, model)` in `llm-error.ts`:
  `model` present → null; configError set → 503 `llm_misconfigured` with
  the message; else 503 `llm_not_configured`. Replaces the four inline
  guards (scoring ×2, rubrics, search).

## Gap 4 — isLlmMisconfiguredError hides the real provider failure

**Current state:** any attempt looking misconfigured flips the whole
error to `llm_misconfigured`; "Gemini rate-limited, Groq misconfigured"
becomes "config invalid" and the rate limit detail is lost.

**Fix in `llm-error.ts`:**
- Per-attempt classification: `misconfigured` (model-id / key regexes) vs
  `transient` (429/5xx/rate-limit/quota/timeout/network) vs `failed`.
- `AllProvidersFailedError` with **every** attempt misconfigured →
  `llm_misconfigured` (unchanged behaviour for the single-provider case).
- Mixed / all-transient → 502 `bad_response` whose message is a
  sanitised per-provider breakdown: `"google (transient - rate limited): ...; groq (configuration invalid): check HIRELENS_LLM_GROQ_MODEL"`.
  Frontend `describeError` already renders non-internal `bad_response`
  details verbatim, so this reaches the user.

## Gap 5 — maxDuration not set

**Current state:** the 120 s LLM deadline assumes the serverless function
allows at least that; Next's default is 10 s on Vercel, which would kill
long scoring batches silently.

**Fix:** `export const maxDuration = 120` on
`apps/web/app/api/[[...route]]/route.ts`, clamped comment for Hobby-plan
hosts (their max is 60 s — lower the constant, or raise the plan).

## Quick win — `<mark>` text colour

**Current state:** default user-agent mark colour is black-on-yellow
(`random` yellow × near-black text on the dark UI = unreadable), several
marks set only `background`/`background-color`.

**Fix:** global CSS rule in `apps/web/app/globals.css`:
`mark { color: inherit; text-decoration: underline; text-decoration-color: ...; border-radius: 2px; }`
— keeps every existing tinted background, fixes text contrast everywhere
(demo page, evidence viewer, product shots) with no per-component edits.

## Quick win — enforce blind review in scoring

**Current state:** `blindReviewDefault` (default true, per job) is a
display-only flag: the review queue masks labels/resume text on request,
but `runBatch` feeds **raw** documents to the LLM. The recruiter's blind
promise is broken at the only place that means anything — scoring.

**Fix:**
- Move `blindView` from `apps/api/src/blind.ts` into
  `@hirelens/core/src/mask/` (it's generic text masking; orchestrator
  can't import from apps/api). `apps/api/src/blind.ts` becomes a
  re-export shim so existing imports/tests keep working.
- `runBatch` (orchestrator): when `job.blindReviewDefault` is true,
  `rawText` fed to `scoreOneCandidate` is `blindView(rawText)`.
  Offsets are length-preserving, so evidence spans stay aligned with the
  unmasked resume the reviewer sees. The stored prompt proves the masked
  text reached the model, and the batch's audit payload records
  `blindReview: true`.
- Jobs with `blindReviewDefault: false` opt out explicitly (unmasked
  scoring is a deliberate org choice, recorded settable in Settings).

## Verification

- Unit tests (no DB): migration-health compare, per-provider breakdown,
  config-error guard, blindView shim export.
- Integration: existing scoring test must still pass — masking only
  replaces the name line/contact line, and its `QUOTE` lives on a later
  line and offsets are length-preserving.
- `pnpm typecheck && pnpm lint`.
- Post-deploy manual checks: `/api/health?db=1` shows
  `migrations: { applied: 13, expected: 13 }` and the Settings card shows
  the config banner without an LLM env.
