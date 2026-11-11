# Architecture

HireLens is a pnpm + Turborepo monorepo. This page describes the system as it runs on `main`. Known gaps and the plan for them are in the [October 2026 audit](docs/audit/2026-10-audit.md).

## Packages

```
apps/
  web/           Next.js 16: marketing site, product UI, candidate tools.
                 Serves the API on the same origin by embedding apps/api
                 (@candidlens/api/embed) in a catch-all route handler.
  api/           Hono REST API. Runs standalone for self-hosters (Docker).
  cli/           `hirelens` on npm: jobs, rubrics, uploads and scoring
                 from a terminal.
packages/
  core/          Framework-free engines (see below). THE PRODUCT.
  db/            Drizzle schema + migrations (Postgres 16 + pgvector) and
                 the Better Auth configuration.
  orchestrator/  Batch scoring runs, audit-log appends, org purge.
  evals/         Eval harness: direction accuracy, self-consistency,
                 position bias, name-swap bias.
  ui/            Design system: OKLCH tokens, components, Storybook.
  config/        Shared TypeScript configs.
```

**Rule:** `packages/core` has zero dependencies on Next.js, React, or any hosting SDK. It is usable from the CLI, the API, a serverless function, or someone else's codebase.

### `packages/core` modules

| Module       | What it does                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract/`   | PDF (unpdf), DOCX (mammoth), TXT and MD to text; magic-byte sniffing; detects scanned PDFs (there is no OCR, so they are rejected with a clear message)                |
| `parse/`     | Text to a Zod-validated `Candidate`; the ATS format check (a deterministic parse simulation); writing-style signals                                                    |
| `dedupe/`    | SHA-256 content hash; fuzzy name and email matching (in core, not yet used by uploads)                                                                                 |
| `rubric/`    | Job description to weighted criteria with anchored 0–5 scales; versioned, forkable JSON rubrics                                                                        |
| `score/`     | Rubric + resume to per-criterion scores with evidence; weighted overall; the four-fifths adverse-impact audit; pool statistics (in core, not yet shown in the product) |
| `evidence/`  | Locates each quoted passage in the resume text, tolerating whitespace and typographic differences                                                                      |
| `llm/`       | Provider registry, failover chain, structured output with a repair round, prompt hashing                                                                               |
| `mask/`      | Blind review: identity masking that keeps evidence offsets aligned                                                                                                     |
| `search/`    | Chunking and embeddings for semantic search and "ask" over resumes                                                                                                     |
| `skills/`    | Skill graph: matched, adjacent and missing skills per candidate                                                                                                        |
| `interview/` | Interview kits built from a scored candidate                                                                                                                           |
| `doctor/`    | Resume Doctor: deterministic resume checks and a 0–100 score, no model involved                                                                                        |
| `audit/`     | Hash-chained, append-only decision log                                                                                                                                 |
| `zip/`       | Safe zip expansion for bulk uploads                                                                                                                                    |

## How a request reaches the API

- **Hosted (Vercel):** the browser talks to the Next.js app, and `/api/*` is handled in the same deployment by the embedded Hono app (`apps/web/app/api/[[...route]]/route.ts`). Sessions are Better Auth cookies on one origin.
- **Self-hosted (Docker Compose):** the web app on `:3000` calls the standalone API on `:4000`; Postgres runs on `:5433`.

## Scoring pipeline (as built)

```
Upload → size and type check → magic-byte sniff → extract text
  → reject scanned or empty documents (no OCR)
  → parse → Candidate record, content hash, ATS format check
  → same text already in this job? skip (idempotent re-upload)
  → scoring run (runBatch): bounded concurrency (default 2), rate-limit-aware
    retries (default 5 attempts), per-candidate failures recorded on the run
      → one structured-output call per candidate, temperature 0:
        every criterion gets a 0–5 score, confidence, rationale and a quote
      → each quote is located in the resume; a positive score whose quote
        is not found is set to 0 and the run is flagged for adjudication
  → weighted overall (0–100)
  → hash-chained audit entry
```

Runs execute inside the API request. There is no durable job queue yet (audit item A1, planned for Phase 4).

## Determinism and the audit trail

Every run records the rubric version, the model id and a prompt hash over the system prompt, prompt, schema id, temperature, seed and model. Each score stores the character offsets of its evidence. Product runs use temperature 0 and send no seed. Providers do not guarantee identical output at temperature 0, so a re-run can differ; the eval harness measures how much (self-consistency on [/evaluation](https://hirelens-rosy.vercel.app/evaluation)).

What the audit trail guarantees is traceability: every stored score can be tied to the exact rubric, model, prompt and quoted evidence that produced it, and the hash chain shows whether any recorded decision was altered.

## Provider layer

`packages/core/llm` resolves a `ProviderConfig` (id, model, apiKey, baseUrl) to a Vercel AI SDK model:

| Provider       | Selected by                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Google Gemini  | `apiKey` + model id                                                                                                                   |
| Anthropic      | `apiKey` + model id                                                                                                                   |
| Groq           | `apiKey` + model id                                                                                                                   |
| Mistral        | `apiKey` + model id                                                                                                                   |
| Cerebras       | `apiKey` + model id                                                                                                                   |
| OpenRouter     | `apiKey` + model id                                                                                                                   |
| Ollama (local) | `baseUrl` (required): Ollama's OpenAI-compatible endpoint, e.g. `http://localhost:11434/v1`; no key, resumes never leave your machine |
- **Failover:** a chain of providers is tried in order when one fails with a transient error. Organizations can choose their provider in settings.
- **Structured output:** `generateStructured` uses the AI SDK's `generateObject` first. Providers that cannot express a schema fall back to JSON-text mode with the schema in the prompt. A schema violation gets one repair round.
- **Errors are typed:** `LlmConfigError`, `LlmRuntimeError`, `SchemaViolationError` and `AllProvidersFailedError`. There is no silent `JSON.parse` fallback.

## Quality gates

Every pull request runs:
- Biome lint;
- typecheck;
- unit tests, plus integration tests against Postgres 16 + pgvector, with migrations applied first;
- the production build;
- a secrets scan;
- CodeQL.

`main` is protected: squash merges only, and those checks must pass. The eval harness needs a model key, so it does not run in CI; its published results are on [/evaluation](https://hirelens-rosy.vercel.app/evaluation).
