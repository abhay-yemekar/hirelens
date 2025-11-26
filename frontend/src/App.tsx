import React, { useMemo, useState } from "react";

type Evaluation =
  | {
      score: number;
      strengths: string[];
      gaps: string[];
      suggestions: string[];
    }
  | { raw: string };

type AnalyzeResponse = {
  ok: boolean;
  chunks: number;
  evaluation: Evaluation;
  resumePreview: string;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function App() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [chatLog, setChatLog] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);

  const canUpload = resumeFile && jdFile && !uploading;

  async function handleUpload() {
    if (!resumeFile || !jdFile) return;
    setUploading(true);
    setError(null);
    setData(null);
    setChatLog([]);
    try {
      const form = new FormData();
      form.append("resume", resumeFile);
      form.append("jd", jdFile);

      const r = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
      const json = (await r.json()) as AnalyzeResponse;
      if (!r.ok || !json.ok) throw new Error((json as any).error || "Analyze failed");
      setData(json);
    } catch (e: any) {
      setError(e.message || "Analyze failed");
      alert(e.message || "Analyze failed");
    } finally {
      setUploading(false);
    }
  }

  async function askQuestion() {
    if (!question.trim() || !data) return;
    const q = question.trim();
    setQuestion("");
    setAsking(true);
    setChatLog((c) => [...c, { role: "user", content: q }]);
    try {
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "chat failed");
      setChatLog((c) => [...c, { role: "assistant", content: json.answer }]);
    } catch (e: any) {
      setChatLog((c) => [...c, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setAsking(false);
    }
  }

  const scoreColor = useMemo(() => {
    const evalObj = data?.evaluation;
    const s = (evalObj && "score" in evalObj ? evalObj.score : 0) ?? 0;
    if (s >= 80) return "#22c55e";
    if (s >= 60) return "#eab308";
    if (s >= 40) return "#f97316";
    return "#ef4444";
  }, [data]);

  const evalIsStructured = data?.evaluation && "score" in data.evaluation;

  return (
    <div className="container">
      {/* KEEP YOUR EXISTING UI CSS/STRUCTURE */}
      <div className="hero">
        <div className="pill">RAG • Local LLM (Ollama)</div>
        <h1>Resume Screener</h1>
        <p>Upload a resume + job description, get a match score, strengths, gaps, and RAG chat.</p>
      </div>

      <div className="card">
        <h2>1. Upload Files</h2>
        <div className="row">
          <div className="col">
            <label>Resume (PDF/TXT)</label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
            />
          </div>
          <div className="col">
            <label>Job Description (PDF/TXT)</label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setJdFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={!canUpload} onClick={handleUpload}>
            {uploading ? "Analyzing..." : "Upload & Analyze"}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setResumeFile(null);
              setJdFile(null);
              setData(null);
              setChatLog([]);
              setError(null);
            }}
          >
            Reset
          </button>
        </div>

        {error && (
          <div className="error">
            Error: {error}
          </div>
        )}
      </div>

      {data && (
        <>
          <div className="card">
            <h2>2. Match Analysis</h2>

            {evalIsStructured ? (
              <>
                <h3 style={{ color: scoreColor }}>
                  {(data.evaluation as any).score}% Match
                </h3>

                <div className="row">
                  <div className="col">
                    <h3>Strengths</h3>
                    {(data.evaluation as any).strengths?.length === 0 && (
                      <p className="small">No clear strengths found.</p>
                    )}
                    {(data.evaluation as any).strengths?.map((s: string, i: number) => (
                      <span className="badge" key={i}>
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="col">
                    <h3>Gaps</h3>
                    {(data.evaluation as any).gaps?.length === 0 && (
                      <p className="small">No obvious gaps found.</p>
                    )}
                    {(data.evaluation as any).gaps?.map((s: string, i: number) => (
                      <span className="badge" key={i}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <h3>Suggestions</h3>
                <ul>
                  {(data.evaluation as any).suggestions?.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="small">
                  Model did not return strict JSON. Showing raw output:
                </p>
                <pre className="pre">
                  {(data.evaluation as any).raw}
                </pre>
              </>
            )}
          </div>

          <div className="card">
            <h2>3. Ask Questions (RAG Chat)</h2>
            <div className="chatbox">
              {chatLog.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <b>{m.role === "user" ? "You" : "AI"}:</b> {m.content}
                </div>
              ))}
              {chatLog.length === 0 && (
                <p className="small">Ask something like: "What are the candidate's key skills?"</p>
              )}
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <input
                className="col"
                placeholder="Ask about the candidate..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") askQuestion();
                }}
              />
              <button disabled={asking || !question.trim()} onClick={askQuestion}>
                {asking ? "Thinking..." : "Send"}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Resume Preview</h2>
            <pre className="pre">{data.resumePreview}</pre>
          </div>
        </>
      )}
    </div>
  );
}
