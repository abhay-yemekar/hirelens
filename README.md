# 📘 Resume Screening Tool (RAG + LLM Powered)

An AI-powered resume-analysis system that evaluates resumes against job descriptions using **Retrieval-Augmented Generation (RAG)**, **embeddings**, and **Large Language Models (LLMs)**.  
The tool identifies **match scores, strengths, gaps, missing skills**, and allows interactive Q&A with contextual retrieval.

---

## 🚀 Key Features

### ✅ **1. Resume + Job Description Upload**  
Upload files in **PDF or TXT** formats. The system automatically extracts clean text using a PDF parser.

### ✅ **2. Embedding-Based Matching**  
The resume and job description are chunked and converted into vector embeddings using either:

- **Ollama local models** (e.g., Llama 2, nomic-embed-text)  
- **OpenAI models** (`text-embedding-3-small`, GPT models)

A cosine similarity algorithm computes a **resume vs. JD match score**.

### ✅ **3. RAG-Powered Chat**  
Ask questions about the resume or job description:  
- “Does the candidate have React experience?”  
- “What are the candidate’s strengths for this role?”

The system retrieves relevant chunks and sends them to an LLM for precise, context-aware responses.

### ✅ **4. Gap & Strength Analysis**  
LLM identifies:  
- Missing keywords  
- Skill mismatches  
- Areas of strength  
- Experience alignment with job requirements  

### ✅ **5. Frontend UI Dashboard**  
A clean, minimal React interface to:  
- Upload files  
- View match scores  
- Explore gaps and strengths  
- Interact with the built-in chat assistant  

---

## 🏗️ System Architecture

```
          ┌─────────────────────┐
          │      Frontend       │ (React + Vite)
          │  File Upload + UI   │
          └─────────┬───────────┘
                    │ REST API
                    ▼
        ┌─────────────────────────────┐
        │          Backend            │ Node.js + Express + TypeScript
        │  - File parsing (PDF/TXT)   │
        │  - Chunking                 │
        │  - Embeddings               │
        │  - Vector similarity        │
        │  - RAG context builder      │
        └──────────┬──────────────────┘
                   │ LLM/Embedding Provider
                   ▼
       ┌───────────────────────────────┐
       │      LLM / Embedding Tier     │
       │  • Ollama (local models)      │
       │        - llama2, nomic        │
       │  • OpenAI API                 │
       │        - GPT-4o-mini          │
       │        - text-embedding-3     │
       └───────────────────────────────┘
```

---

## 🧠 How the RAG Pipeline Works

1. **Extract**: Text is extracted from resume and job description.  
2. **Chunk**: Documents are split into manageable sections.  
3. **Embed**: Embeddings generated using Ollama or OpenAI.  
4. **Store**: Embeddings stored in an in-memory vector store.  
5. **Retrieve**: When analyzing or answering questions, top-K relevant chunks are retrieved.  
6. **Generate**: Retrieved context is passed to the LLM to produce final outputs.

---

## 🛠️ Tech Stack

### **Frontend**
- React (Vite)
- TypeScript

### **Backend**
- Node.js + Express
- TypeScript
- pdf-parse
- cosine similarity
- express-fileupload

### **AI Models**
Supports both:
- **Local LLMs (Ollama)**  
- **Cloud LLMs (OpenAI)**

---

## 🌟 Core Use Cases

- Automating resume screening for HR teams  
- Filtering candidates against specific job requirements  
- Highlighting missing or required skills  
- AI-driven recruitment assistance  
- Chat-based resume Q&A  
- Candidate scoring & ranking  

---

## 📄 Output Summary

After uploading files, the tool provides:

- **Overall match score (0–100%)**
- **Strengths based on resume**
- **Skill gaps / missing JD requirements**
- **Relevant experience extracted from the resume**
- **Chat-style answers referencing resume content**

---

## 📌 RAG + LLM Advantages

- More accurate than simple keyword matching  
- Understands **context**, not just text  
- Gives structured explanations  
- Improves recruiter productivity  
- Works offline with Ollama, or cloud-based with OpenAI  

---

## 🧰 Extensibility

You can extend the system to include:

- PostgreSQL / MongoDB resume history  
- Pinecone / Chroma vector DB  
- ATS integrations  
- Full Docker deployment  
- Fine-tuned LLM scoring models  