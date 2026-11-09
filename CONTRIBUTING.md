# Contributing to CandidLens

Thanks for helping build hiring tools that show their work. This project follows **GitHub Flow**: short-lived branches, pull requests into `main`, squash merges.

## Development setup

```bash
git clone https://github.com/abhay-yemekar/candidlens.git
cd candidlens
pnpm install
docker compose up -d postgres             # Postgres 16 + pgvector on :5433
cp packages/db/.env.example packages/db/.env
pnpm --filter @candidlens/db db:migrate
pnpm dev                                  # every app, through Turborepo
```

You need Node 20+, pnpm 11 and Docker. The full walkthrough, with expected output and fixes for real errors, is in [docs/project_execution.md](docs/project_execution.md); how the pieces fit is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Checks

Run these before every pull request; CI runs the same and never merges on red:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- **Integration tests** in `apps/api/tests/*.int.test.ts` run against a real database when `DATABASE_URL` is set, and skip otherwise (CI always runs them). Point `DATABASE_URL` at a scratch database: the tests create and delete their own data.
- **Database changes** go through Drizzle: edit `packages/db/src/schema`, run `pnpm --filter @candidlens/db db:generate`, commit the new migration, then `pnpm --filter @candidlens/db gen:migrations` to refresh the snapshot the health check uses.
- **UI changes** need a screenshot in the pull request, and should work with a keyboard and at phone width.

## The workflow

1. **Open or pick an issue** so the change has a home.
2. **Branch off `main`** as `<type>/<scope>-<slug>`, for example `fix/core-doctor-role-dashes` or `docs/readme-candidlens`.
3. **Commit with Conventional Commits** and a lowercase subject: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`. Breaking changes use `feat!:` or a `BREAKING CHANGE:` footer.
4. **Open a pull request** and fill in the template: what changed, why, how it was tested.
5. **Review your own diff** first: leftover logging, hardcoded values, dead code, secrets.
6. **Squash and merge** once CI is green, with a Conventional Commit as the squash message, and delete the branch.

## Code standards

- TypeScript `strict: true`. No `any` without a reason; no `@ts-ignore` without an issue link.
- Zod schemas at every trust boundary: request bodies, model output, settings, uploads.
- No secrets in code, ever. `.env.example` documents every setting.
- Every exported function in `packages/core` gets a doc comment and a unit test.
- Errors are typed and structured, not bare `throw new Error(string)` in application paths.
- Accessibility blocks a merge, like a failing test.
- Never commit real resumes or candidate data; use the synthetic files in `sample-data/`.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/abhay-yemekar/candidlens/issues/new/choose). For security vulnerabilities, follow [SECURITY.md](SECURITY.md) and don't open a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
