// ✅ MUST be first so .env loads
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fileUpload, { UploadedFile } from "express-fileupload";

import { embed, chat } from "./utils/openai";
import { chunkText } from "./utils/chunkText";
import { extractTextFromFile } from "./utils/extract";
import { vectorStore } from "./vectorstore/InMemoryVectorStore";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(
  fileUpload({
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    useTempFiles: false,
  })
);

// ---- Health ----
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    useOllama: process.env.USE_OLLAMA,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    chatModel: process.env.CHAT_MODEL,
  });
});

// ---- Analyze Resume + JD ----
// IMPORTANT: frontend is calling /api/analyze with FormData keys "resume" and "jd"
app.post("/api/analyze", async (req, res) => {
  try {
    if (!req.files?.resume || !req.files?.jd) {
      return res.status(400).json({ error: "resume and jd files are required" });
    }

    const resumeFile = req.files.resume as UploadedFile;
    const jdFile = req.files.jd as UploadedFile;

    // 1) Extract text
    const resumeText = await extractTextFromFile(resumeFile);
    const jdText = await extractTextFromFile(jdFile);

    if (!resumeText.trim() || !jdText.trim()) {
      return res.status(400).json({ error: "empty resume/jd text" });
    }

    // 2) Reset store
    vectorStore.clear();

    // 3) Chunk resume
    const chunks = chunkText(resumeText);

    // 4) Embed chunks + store
    const embeddings = await Promise.all(chunks.map((c: string) => embed(c)));
    chunks.forEach((chunk: string, i: number) => {
      vectorStore.add({
        id: `resume-${i}`,
        text: chunk,
        embedding: embeddings[i],
      });
    });

    // 5) Evaluate match
    const evaluationPrompt = `
You are a strict recruiter ATS system.

Compare RESUME vs JOB DESCRIPTION and give:
1. Match score out of 100
2. Top strengths (bullets)
3. Missing skills/gaps (bullets)
4. 3 improvement suggestions

RESUME:
${resumeText}

JOB DESCRIPTION:
${jdText}

Return ONLY valid JSON with keys:
score, strengths, gaps, suggestions.

Rules:
- strengths, gaps, suggestions must be arrays of strings
- score must be a number (0-100)
- no markdown, no extra text.
`;

    const evaluationRaw = await chat([
      { role: "system", content: "You are a helpful ATS recruiter." },
      { role: "user", content: evaluationPrompt },
    ]);

    // 6) Try to parse JSON safely, else return raw
    let evaluation: any = null;
    try {
      evaluation = JSON.parse(evaluationRaw);
    } catch {
      evaluation = { raw: evaluationRaw };
    }

    res.json({
      ok: true,
      chunks: chunks.length,
      evaluation,
      resumePreview: resumeText.slice(0, 3000),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "analyze failed" });
  }
});

// ---- RAG Chat about candidate ----
app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    // 1) Embed question
    const qEmbed = await embed(question);

    // 2) Retrieve top chunks
    const top = vectorStore.search(qEmbed, 4);
    const context = top.map((t: any) => t.text).join("\n\n");

    // 3) Ask Ollama
    const ragPrompt = `
You are an HR assistant.
Answer ONLY from the resume context below.

CONTEXT:
${context}

QUESTION:
${question}

If context doesn't contain the answer, say exactly: "Not found in resume."
`;

    const answer = await chat([
      { role: "system", content: "You answer strictly from provided context." },
      { role: "user", content: ragPrompt },
    ]);

    res.json({
      ok: true,
      answer,
      sources: top.map((t: any) => ({
        id: t.id,
        score: t.score,
        preview: t.text.slice(0, 200),
      })),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "chat failed" });
  }
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Using ollama at ${process.env.OLLAMA_BASE_URL}`);
});
