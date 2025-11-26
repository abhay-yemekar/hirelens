# JobTalk Resume Screening Backend (RAG)

## Prereqs
- Node.js 18+
- OpenAI API key

## Setup
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://localhost:4000`.

## Endpoints
- `POST /api/upload` (multipart/form-data)
  - fields: `resume` (pdf/txt), `jd` (pdf/txt)
  - returns `sessionId`, extracted resume fields, match score, strengths/gaps.
- `POST /api/chat`
  - JSON: `{ "sessionId": "...", "question": "..." }`
  - does: embed question -> vector search over resume chunks -> send retrieved context to LLM.

## Notes
This uses an in-memory vector store for simplicity. Swap with Pinecone/Qdrant/pgvector easily.
