---
name: hirelens-test
description: Use when writing or running HireLens tests — file conventions, helpers, auth setup, and the two test tiers (unit vs Postgres-gated integration).
---

# HireLens test playbook

## Two tiers
- **Unit** (`packages/core/src/**/*.test.ts`): always run, no DB. Run: `pnpm --filter @hirelens/core test`.
- **Integration** (`apps/api/tests/*.int.test.ts`): `describe.skipIf(!available && allowSkip)` — silently skip without `DATABASE_URL`. Never assume "all passed" means integration ran; check the skip count in output.

## Integration conventions (follow existing files, e.g. talent-pool.int.test.ts)
- Names stamped unique: `` `${STAMP}` `` where `const STAMP = Date.now()`.
- Auth: `auth.api.signUpEmail` → capture `set-cookie` → `createOrganization` → `setActiveOrganization`, all with the cookie header.
- Requests: `app.request(path, { headers: authHeaders })` against `createApp()`.
- Resume helper: `resume(name, email, skills)` + `new File([...], "x.txt", { type: "text/plain" })` in a `FormData`.
- Cleanup: delete created org rows at the end (`db.delete(organization).where(eq(organization.id, orgId))` cascades).
- Error-shape typing: never `(await res.json()).x as T` in one expression (TS2571) — two-step: `const body = (await res.json()) as { x: T };`.
- Response list types: check the route's `.select({...})` before annotating (e.g. talent-pool rows include `jobId` AND `jobTitle`).

## Running
```bash
docker compose up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5433/hirelens pnpm --filter @hirelens/api exec vitest run tests/<file>.int.test.ts
```

## Rules
- Fix failures by cause. Never weaken assertions, skip tests, or add suppressions to pass.
- New behavior → new test in the same style; audit assertions read the `auditLog` table directly (no JSON audit endpoint exists).
