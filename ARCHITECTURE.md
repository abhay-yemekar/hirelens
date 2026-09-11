# Architecture

HireLens is a pnpm + Turborepo monorepo. The scoring engines are built and battle-tested; the product UI is being built on top of them. This document describes how the system works **today**, then the target architecture it is evolving into.

## Current system (monorepo)

```
┌──────────────────────────────────────────────────────────────┐
│  packages/core — framework-free engines (THE PRODUCT)        │
│                                                              │
│  extract/   PDF (unpdf) · DOCX (mammoth) · TXT/MD            │
│             magic-byte sniffing, scanned-PDF detection       │
│  parse/     text → Zod-validated Candidate (JSON-Resume-ish) │
│  dedupe/    sha256 content hash + fuzzy name/email matching  │
│  rubric/    JD → 5–8 weighted criteria, anchored 0–5 scales; │
│             versioned, forkable, exportable JSON artifacts   │
│  score/     rubric + resume → per-criterion scores with      │
│             evidence spans (character offsets), confidence,  │
│             rationale, pool stats, consistency guard         │
│  llm/       provider-agnostic structured output over AI SDK: │
│             Google/Anthropic/Groq/OpenRouter/Ollama,         │
│             Zod validation + automatic repair round          │
│  audit/     hash-chained append-only decision log            │
│  zip/       safe batch expansion for bulk uploads            │
└──────────┬───────────────────────────────────────┬───────────┘
           │                                       │
┌──────────▼────────────────┐   ┌──────────────────▼──────────┐
│  packages/db              │   │  packages/orchestrator      │
│  Drizzle schema + migra-  │◄──│  runBatch: fan-out scoring  │
│  tions (Postgres+pgvector)│   │  with bounded concurrency,  │
│  identity/org/jobs/candi- │   │  retries, progress stream;  │
│  dates/rubrics/runs/scores│   │  persists runs, scores,     │
│  /evidence/audit_log      │   │  evidence + audit records   │
└───────────────────────────┘   └─────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Surfaces: apps/api (Hono, /api/health today) · apps/web     │
│  (Next.js, product UI in progress) · apps/cli · packages/ui  │
│  (OKLCH design system + Storybook)                           │
└──────────────────────────────────────────────────────────────┘
```

Quality posture: ~89 tests (unit + component + DB-backed integration), strict TypeScript, Biome clean, CodeQL clean on every PR, DB migrations applied in CI before integration tests run.

## Provider layer

`packages/core/llm` abstracts the model behind `ProviderConfig` (id, model, apiKey, baseUrl) over the Vercel AI SDK:

| Provider | Selected by |
|---|---|
| Google Gemini | `apiKey` + model id |
| Anthropic | `apiKey` + model id |
| Groq | `apiKey` + model id |
| OpenRouter | `apiKey` + model id |
| Ollama (local) | `baseUrl` — no key, resumes never leave your machine |

`generateStructured` forces a tool-call, validates with Zod, runs one automatic repair round on violation, and raises typed errors (`LlmConfigError`, `LlmRuntimeError`, `SchemaViolationError`) — there is no silent `JSON.parse` fallback anywhere. Every call yields a deterministic `promptHash` for the audit trail.

## Target architecture (v1.0.0)

The prototype becomes a pnpm + Turborepo monorepo:

```
apps/
  web/          Next.js — product UI + Route Handlers
  api/          Hono server — same routes, for self-hosters
  cli/          npx hirelens
packages/
  core/         THE PRODUCT. Framework-free, pure TypeScript:
                  extract/   PDF/DOCX/TXT → normalized text, magic-byte sniffing
                  parse/     text → structured, Zod-validated Candidate schema
                  dedupe/    content hashes + fuzzy identity matching
                  rubric/    JD → criteria; rubric versioning & validation
                  score/     rubric + candidate → scores + evidence spans
                  evidence/  span location, offset mapping, quote extraction
                  llm/       provider abstraction, structured output, retry/repair
                  audit/     hash-chained append-only decision log
                  bias/      adverse impact, selection-rate ratios (next phase)
  db/           Drizzle schema + migrations (Postgres + pgvector)
  ui/           shadcn-based design system
  evals/        benchmark dataset + accuracy/consistency/bias harness
  config/       shared tsconfig, biome, tailwind preset
```

**Rule:** `packages/core` has zero dependencies on Next.js, React, or any hosting SDK. It is usable from the CLI, the API, a Lambda, or someone else's codebase — that is what makes HireLens a platform rather than an app.

### Scoring pipeline (target)

```
Upload → size/type check → content hash → dedupe
  → extract text + layout → OCR fallback if text density is too low
  → structured parse → Candidate record
  → fan-out (concurrency-limited background jobs)
      → per criterion: score 0–5 with evidence spans (structured output, temp 0)
      → consistency guard: N samples, flag if variance > threshold
  → weighted aggregate → pool percentile
  → append-only, hash-chained audit entry
  → stream progress to UI
```

Every score is reconstructible from the run record alone: same model, same version, same prompt hash, same seed, temperature 0 → same output. That is the defensibility guarantee.
