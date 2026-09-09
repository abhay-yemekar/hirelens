# Contributing to HireLens

Thanks for helping build glass-box hiring intelligence. This project follows **GitHub Flow** — short-lived branches, PRs into `main`, squash merges.

## Development setup

```bash
git clone https://github.com/abhay-yemekar/hirelens.git
cd hirelens
pnpm install
pnpm dev            # run apps locally
pnpm lint && pnpm typecheck && pnpm test   # must pass before every PR
```

Prereqs: Node 18+, pnpm 9+.

## The workflow

1. **Branch off `main`** — `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`, `ci/<slug>`.
2. **Commit with Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`. Breaking changes: `feat!:` or a `BREAKING CHANGE:` footer.
3. **Push and open a PR early** (draft if work-in-progress). Fill in the PR template: what, why, how tested, screenshots for UI changes.
4. **Let CI run** — lint, typecheck, test, build. Never merge on a red check.
5. **Self-review your diff** before requesting review. Hunt for leftover `console.log`, hardcoded values, dead code, and secrets.
6. **Squash and merge.** One commit per feature on `main`; the squash message must be a valid Conventional Commit.
7. **Delete the merged branch.**

## Code standards

- TypeScript `strict: true`. No `any` without justification; no `@ts-ignore` without an issue link.
- Zod schemas at every trust boundary (HTTP body, LLM output, env vars, uploads).
- No secrets in code, ever. `.env.example` documents every variable.
- Every exported function in `packages/core` gets a doc comment and a unit test.
- Errors are typed and structured — no bare `throw new Error(string)` in application paths.
- Accessibility is a merge blocker, not a nice-to-have.

## Reporting bugs and requesting features

Use the issue templates. For security vulnerabilities, see [SECURITY.md](SECURITY.md) — do not open a public issue.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
