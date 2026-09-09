# HireLens

**See why, not just who.**

The open-source, glass-box hiring intelligence platform. Rank candidates against a job with evidence-linked scores, rubric transparency, and built-in bias auditing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Status: early prototype, pre-v1.0.** This README describes exactly what the code does today — nothing more. The roadmap to v1.0.0 (30 September 2026) is at the bottom.

---

## What HireLens does today

Upload a resume and a job description (PDF or TXT). HireLens:

1. Extracts the text with a PDF/text parser.
2. Chunks the resume and embeds the chunks (OpenAI or a local Ollama model).
3. Computes a **match score (0–100)** with **strengths, gaps, and improvement suggestions** from an LLM.
4. Lets you **chat with the resume** — questions are answered only from retrieved resume context (RAG), with source chunks shown.

Every answer is grounded in retrieved resume text. The vector store is in-memory and per-process — nothing is persisted, which is honest for a prototype and safe to run.

## Quickstart (60 seconds)

Prereqs: Node 18+ and either an OpenAI API key or a local [Ollama](https://ollama.com) install.

```bash
git clone https://github.com/abhay-yemekar/hirelens.git
cd hirelens/backend
cp .env.example .env          # fill in OPENAI_API_KEY (or set USE_OLLAMA=true + OLLAMA_BASE_URL)
npm install
npm run dev
# → http://localhost:4000
```

```bash
# in a second terminal
cd frontend
npm install
npm run dev
# → http://localhost:5173 — upload resume + JD, get score, strengths, gaps, chat
```

## How it works

```
resume.pdf + jd.pdf ─▶ extract text ─▶ chunk ─▶ embed ─▶ in-memory vector store
                                                          │
              JD match: chunks + JD ─▶ LLM ─▶ {score, strengths, gaps, suggestions}
              Q&A:      question ─▶ embed ─▶ top-K chunks ─▶ LLM ─▶ grounded answer
```

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Configuration

All configuration lives in `backend/.env` ([`.env.example`](backend/.env.example) documents every variable):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Cloud LLM + embeddings |
| `USE_OLLAMA` / `OLLAMA_BASE_URL` | Fully local mode — resumes never leave your machine |
| `EMBEDDING_MODEL` / `CHAT_MODEL` | Model selection |
| `PORT` | Backend port (default 4000) |

## Sample data

`sample-data/` ships a resume and a job description you can upload immediately without using your own files.

## Why glass-box

Most hiring AI is a black box: a number with no justification. That is a liability — for candidates, for recruiters, and under emerging regulation. HireLens is built around a different contract: **every score must link to the exact evidence that produced it.** This prototype takes the first step (retrieval-grounded answers with visible sources); the full rubric-with-evidence-spans engine is the core of the v1.0.0 roadmap below.

## Comparison

| | HireLens | Commercial AI screeners | OpenATS |
|---|---|---|---|
| Open source | ✅ MIT | ❌ | ✅ |
| Self-host / local LLM mode | ✅ | ❌ | ✅ |
| Score justification | retrieval-grounded answers, visible sources | black box | none (no AI) |
| Bias auditing | on the roadmap (v1.0.0) | opaque | n/a |
| Modern UX | ✅ | ✅ | ❌ |

## Roadmap to v1.0.0 — 30 September 2026

The prototype above becomes a monorepo (`apps/web`, `apps/api`, `apps/cli`, `packages/core`) shipping:

- **Rubric engine** — paste a JD, get 5–8 weighted criteria with an anchored 0–5 scale; recruiter reviews/edits before any scoring runs
- **Evidence spans** — every criterion score links to the exact character offsets in the resume that justify it
- **Deterministic scoring** — temperature 0, pinned model version, stored prompt hash; every decision in an append-only, hash-chained audit log
- **Bias audit** — adverse-impact metrics (four-fifths rule, selection-rate ratios) exportable as a report
- **Blind review** — one toggle masks name, photo, address, school, graduation year
- **Local-first, model-agnostic** — bring your own key (Gemini, Groq, OpenRouter, Anthropic, OpenAI) or run fully on Ollama
- **Self-host** — `docker compose up`, plus a public REST API and `npx hirelens` CLI

Follow along in [Issues](https://github.com/abhay-yemekar/hirelens/issues) and the pinned Roadmap discussion.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labeled `good first issue`. Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md). **Do not open a public issue for security reports.**

## A note on privacy

Resumes are personal data. Never commit real resumes to git, always know where your candidate data is stored, and use the local Ollama mode if resumes must not leave your infrastructure. HireLens itself never phones home.

## License

[MIT](LICENSE)
