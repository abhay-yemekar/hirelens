# Architecture

HireLens is currently a two-folder prototype (Express backend + Vite React frontend) on its way to a monorepo. This document describes how the running system works **today**, then the target architecture it is evolving into.

## Current system (prototype)

```
┌─────────────────────┐
│  Frontend (Vite)    │  file upload, score display, RAG chat UI
└──────────┬──────────┘
           │ REST (FormData / JSON)
┌──────────▼──────────────────────────────────────────┐
│  Backend (Express + TypeScript, port 4000)          │
│                                                     │
│  POST /api/analyze                                  │
│    1. extract text from resume.pdf + jd (pdf-parse) │
│    2. chunk resume (~1800 chars)                    │
│    3. embed chunks (OpenAI or Ollama)               │
│    4. store in in-memory vector store               │
│    5. LLM evaluates resume vs JD →                  │
│       { score, strengths, gaps, suggestions }       │
│                                                     │
│  POST /api/chat                                     │
│    1. embed question                                │
│    2. top-K similarity search over resume chunks    │
│    3. LLM answers strictly from retrieved context   │
└─────────────────────────────────────────────────────┘
```

Known limitations (tracked in Issues, fixed on the roadmap):

- The LLM evaluation is parsed with `JSON.parse` in a `try/catch` that silently falls back to raw text — schema-enforced structured output with retry/repair replaces this in v1.0.0.
- `pdf-parse` mangles multi-column PDF layouts; layout-aware extraction (`unpdf`/`mammoth`) replaces it.
- The vector store is in-memory and per-process; Postgres + pgvector replaces it.

## Provider layer

The backend talks to exactly two providers today:

| Provider | Used for | Selected by |
|---|---|---|
| OpenAI-compatible API | embeddings + chat | `OPENAI_API_KEY` + models in `.env` |
| Ollama (local) | embeddings + chat | `USE_OLLAMA=true` + `OLLAMA_BASE_URL` |

Local mode means resumes never leave your machine. The v1.0.0 provider abstraction generalizes this to Gemini, Groq, OpenRouter, and Anthropic behind one interface — bring your own key, never a hardcoded provider.

## Target architecture (v1.0.0)

The prototype becomes a pnpm + Turborepo monorepo:

```
apps/
  web/          Next.js — product UI + Route Handlers
  api/          Hono server — same routes, for self-hosters
  cli/          npx hirelens
packages/
  core/         THE PRODUCT. Framework-free, pure TypeScript:
                  extract/   PDF/DOCX/OCR → normalized text + layout metadata
                  parse/     text → structured Candidate schema
                  rubric/    JD → criteria; rubric versioning & validation
                  score/     rubric + candidate → scores + evidence spans
                  evidence/  span location, offset mapping, quote extraction
                  bias/      adverse impact, selection-rate ratios, parity metrics
                  audit/     hash-chained append-only decision log
                  llm/       provider abstraction, structured output, retry/repair
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
