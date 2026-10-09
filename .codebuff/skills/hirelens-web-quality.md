---
name: hirelens-web-quality
description: Use when touching the HireLens marketing site, landing page, metadata, or repo presentation — known presentation debts and the quality bar to keep.
---

# HireLens presentation playbook

## Known presentation debts (external review, Oct 2026) — verify before acting on any item

**Blocking (invisible/understandable)**
- `apps/web/app/providers.tsx` is a client component gating EVERY route (incl. landing, /demo, /docs) behind "Loading…" until session round-trip — crawlers/link previews see nothing. Fix: gate only protected routes (`pathname.startsWith` over the protected list).
- Demo page `<mark>` highlight: no `color: inherit` → black text on dark background (evidence highlight unreadable; also wrong in demo GIF frames).
- Eval stat cards (47% / 0σ / τ 1) read as "fails / too perfect" — mock-model caveat is small; replace with methodology note or show live results with model+date+n.

**Metadata/branding**
- No OG image, favicon file present?, Twitter card = summary; root layout description says "RAG + LLM powered" (conflicts with positioning).
- GitHub: social preview must be uploaded via repo Settings → Social preview (`.github/social-preview.png` in-repo does nothing); About box website field; `package.json` homepage + version strings (0.1.0 vs v1.4.0 tag; also `/api/health` returns version 0.1.0 — keep in sync).
- README: demo GIF choppiness/first-frame, Quickstart buried ~95 lines down, "10b" numbering glitch, feature list → grouped table, add Limitations section, stale docs (ARCHITECTURE.md "~89 tests"/"UI in progress", SECURITY.md backend//frontend/ paths).

**Naming/trademark**
- "HireLens" collides with Ceipal's recruiting product and a Product Hunt AI resume tool. Before any public launch: trademark search + consider "open-source glass-box" qualifier in page title. Domain: currently hirelens-rosy.vercel.app (no custom domain — rename would be cheap NOW, expensive after).

## Quality bar for new site work
- Every page: real SSR content without JS (no client-component loading gates on public routes).
- Claims must match code (see hirelens-security-audit skill — grep landing/README for over-claim phrases before merging site copy).
- Metadata: per-page title/description, OG image present, favicon valid.
- WCAG AA contrast on all new elements (baseline passes; don't regress).
