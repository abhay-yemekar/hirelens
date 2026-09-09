# What does this PR change?

<!-- One or two sentences: the what and the why. Link the issue: Closes #123 -->

## How was it tested?

<!-- Unit tests? Manual steps? Playwright run? Paste the evidence. -->

## Screenshots

<!-- Required for any UI change. Before/after beats after-only. -->

## Checklist

- [ ] All CI checks green
- [ ] Tests added for new `packages/core` logic
- [ ] No `any`, no `console.log`, no commented-out code, no unlinked TODO
- [ ] Zod validation at any new trust boundary
- [ ] Loading / empty / error states designed for new views
- [ ] Keyboard accessible; axe clean; `prefers-reduced-motion` respected
- [ ] Works in dark and light
- [ ] Docs updated if behavior changed
- [ ] Self-reviewed the full diff
