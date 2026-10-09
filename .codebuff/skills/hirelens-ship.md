---
name: hirelens-ship
description: Use when shipping changes to the HireLens repo — branch, verify, PR, merge, post-merge checks, following this repo's exact conventions.
---

# HireLens ship playbook

## Branching & commits
- Branch from fresh `main` (`git pull origin main` first). Names: `feat/…`, `fix/…`, `docs/…`.
- Conventional commits, subject ≤100 chars (commitlint enforced). One logical change per commit.
- Trailer on every commit:
  ```
  🤖 Generated with Codebuff
  Co-Authored-By: Codebuff <noreply@codebuff.com>
  ```
- Never `git add -A`. Stage explicit paths. Before staging web changes: `git checkout -- apps/web/next-env.d.ts` (auto-generated churn).

## Required local verification (all must exit 0)
```bash
pnpm --filter @hirelens/core typecheck && pnpm --filter @hirelens/core test   # 118+ tests
pnpm --filter @hirelens/api typecheck                                         # tsc --noEmit
pnpm --filter @hirelens/web typecheck
pnpm exec biome check --write <changed files>                                 # re-read files after: biome reformats
```
Integration tests need Postgres: `docker compose up -d postgres` (container `hirelens-postgres`, port 5433, often stopped — check `docker exec hirelens-postgres pg_isready -U postgres -d hirelens`), then:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5433/hirelens pnpm --filter @hirelens/api exec vitest run tests/<file>.int.test.ts
```

## PR & merge
- `gh pr create` with sections per change + test evidence. CI checks: Lint/Typecheck/Test/Build, Secrets scan, CodeQL, Vercel preview.
- `gh pr checks <n> --watch` until all pass (or `gh run watch <id> --exit-status`).
- Merge: `gh pr merge <n> --squash --delete-branch` (auto-merge is disabled repo-wide; account: abhay-yemekar).
- Post-merge: `git checkout main && git pull`, confirm main CI success, `curl -s -o /dev/null -w "%{http_code}" https://hirelens-rosy.vercel.app` → 200.

## Environment gotchas (Windows host)
- `str_replace` fails after biome reformats a file — always re-read before editing.
- code_search tool can ENOENT on vendored ripgrep — fall back to terminal `grep -rn`.
- Long inline `node -e` / `tsx -e` evals hang — write a scratch `.mts` in apps/api and `pnpm --filter @hirelens/api exec tsx <file>` with a timeout instead.
- Capture real exit status through pipes: `cmd | tail -5; echo ${PIPESTATUS[0]}`.
