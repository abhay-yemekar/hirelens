---
name: hirelens-error-ux
description: Use when HireLens UI shows "Something went wrong talking to the API" or when adding API error codes — the frontend maps only some codes; unmapped ones fall to the generic banner.
---

# HireLens error-UX playbook

## Root cause pattern
`apps/web/src/lib/errors.ts` `describeError()` switches on `ApiRequestError.code` and maps only: `llm_not_configured`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `bad_request`/`validation_error`. Everything else → "Something went wrong talking to the API." The API emits ~35 codes (`grep -rh 'error: "' apps/api/src/routes/*.ts | sort -u`).

When a screenshot shows the generic banner on a page that otherwise renders, the failing request is usually one of several parallel fetches in a `Promise.all` (job pages load job+rubrics+candidates+runs together) — identify which call failed before touching code. `bad_response` (non-JSON reply) typically means a platform-level 5xx/cold-start, not app code.

## Rules for new error codes
1. Any code added to `apps/api/src/routes/*` that a user can trigger should get a case in `describeError()` with plain-language text and, where actionable, a `cta` (label + href). Raw codes never reach the UI.
2. `describeError` maps codes to tone error|warning|info — pick info/warning when the user can fix it (e.g. `llm_not_configured` → warning with setup steps).
3. For request-id support: after deploying Sentry trace propagation (planned), include `Error details: <requestId>` in the CTA href so `/contact` reports are debuggable.

## Known unmapped codes worth handling (as of Oct 2026)
`rate_limited` (429 — should say "too many tries, wait a minute", tone warning), `invalid_zip`, `file_too_large`, `unsupported_media_type`, `unreadable_document`, `file_unavailable`, `no_rubric`, `no_scores`, `embedding_not_configured`, `blind_review_active`, `job_closed`, `internal_error`, `bad_response` (non-JSON — distinguish "service unavailable, retry" from unknown bugs).
