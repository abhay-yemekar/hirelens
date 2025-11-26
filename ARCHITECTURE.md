# Architecture

## High Level
1. **Upload** resume + JD (PDF/TXT).
2. **Parse** PDF to raw text via `pdf-parse`.
3. **Chunk** resume into ~1800‑char sections.
4. **Embed** each chunk with OpenAI embeddings.
5. **Store** vectors in an in‑memory vector store.
6. **Match score** computed heuristically using JD tokens vs resume skills.
7. **Chat (RAG)**:
   - Embed user question
   - Vector search top‑K chunks
   - Send only retrieved chunks + question to LLM
   - Return grounded answer.

## Why RAG
LLMs have no access to your resume unless you provide it. RAG lets you:
- keep long documents outside the prompt
- retrieve only relevant parts
- reduce cost and hallucinations
