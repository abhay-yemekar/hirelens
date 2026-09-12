"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DEMO_JD, DEMO_RESUMES } from "@/lib/demo-data";

interface EvidenceSpan {
  quotedText: string;
  start: number;
  end: number;
}
interface CriterionRow {
  key: string;
  title: string;
  score: number;
  rationale: string;
  evidence: EvidenceSpan[] | null;
}
interface ScorePayload {
  mode: "llm" | "heuristic";
  overall: number;
  modelId: string;
  criteria: CriterionRow[];
}

const CRITERION_COLORS = [
  "var(--blue-bg)",
  "var(--green-bg)",
  "var(--amber-bg)",
  "var(--purple-bg)",
  "var(--teal-bg)",
  "var(--pink-bg)",
];

function colorFor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 997;
  return CRITERION_COLORS[h % CRITERION_COLORS.length] ?? "var(--color-accent)";
}

/** Render resume text with evidence spans wrapped in <mark>. */
function HighlightedResume({
  text,
  spans,
}: {
  text: string;
  spans: Map<number, { end: number; color: string }>;
}) {
  const nodes: React.ReactNode[] = [];
  const sorted = [...spans.entries()].sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, { end, color }] of sorted) {
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark key={start} style={{ backgroundColor: color, borderRadius: 4, padding: "0 2px" }}>
        {text.slice(start, Math.max(end, start + 1))}
      </mark>,
    );
    cursor = Math.max(end, start + 1);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <pre className="whitespace-pre-wrap font-mono text-[13px] leading-6">{nodes}</pre>;
}

export default function DemoPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ScorePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCriterion, setActiveCriterion] = useState<string | null>(null);
  const [showJd, setShowJd] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const selected = DEMO_RESUMES.find((r) => r.id === selectedId) ?? null;

  const score = useCallback(async () => {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumeId: selectedId }),
      });
      const body = (await res.json()) as ScorePayload & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Scoring failed.");
        return;
      }
      setResult(body);
      setActiveCriterion(null);
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        60,
      );
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setPending(false);
    }
  }, [selectedId]);

  const spans = useMemo(() => {
    const map = new Map<number, { end: number; color: string }>();
    if (!result || !selected) return map;
    for (const c of result.criteria) {
      for (const e of c.evidence ?? []) {
        if (Number.isInteger(e.start) && e.start >= 0 && e.end > e.start) {
          map.set(e.start, { end: e.end, color: colorFor(c.key) });
        }
      }
    }
    return map;
  }, [result, selected]);

  const activeEvidence = useMemo(() => {
    if (!activeCriterion || !result) return [];
    return result.criteria.find((c) => c.key === activeCriterion)?.evidence ?? [];
  }, [activeCriterion, result]);

  const overallColor =
    result == null
      ? "var(--color-fg-muted)"
      : result.overall >= 70
        ? "var(--green-fg)"
        : result.overall >= 45
          ? "var(--amber-fg)"
          : "var(--red-fg)";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--color-fg-muted)" }}>
          Live demo — no signup
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Watch scoring happen, with the evidence
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--color-fg-muted)" }}>
          Pick a resume, press score. Every point is backed by quoted text from the document — the
          same engine, rubric, and evidence spans the product uses.
        </p>
        <button
          type="button"
          onClick={() => setShowJd((v) => !v)}
          className="mt-3 text-sm font-medium underline"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {showJd ? "Hide" : "Show"} the job description
        </button>
        {showJd && (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border p-4 text-xs leading-6">
            {DEMO_JD}
          </pre>
        )}
      </header>

      <section aria-label="Resumes">
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Candidate resumes (synthetic)
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_RESUMES.map((r) => {
            const active = r.id === selectedId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedId(r.id);
                  setResult(null);
                }}
                className="rounded-lg border p-3 text-left transition-colors"
                style={{
                  borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                  backgroundColor: active ? "var(--color-surface-sunken)" : "transparent",
                }}
              >
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="block text-xs" style={{ color: "var(--color-fg-muted)" }}>
                  {r.role}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={score}
          disabled={!selectedId || pending}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          {pending ? "Scoring…" : `Score ${selected?.name ?? "a resume"}`}
        </button>
        {result && (
          <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            {result.mode === "llm"
              ? `Scored by ${result.modelId}`
              : "Heuristic mode (no LLM key on this server) — add HIRELENS_LLM_* for real scoring"}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--red-fg)" }}>
          {error}
        </p>
      )}

      {result && selected && (
        <div ref={resultRef} className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
                style={{ backgroundColor: "var(--color-surface-sunken)", color: overallColor }}
              >
                {result.overall}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                  {selected.role} — overall score out of 100
                </p>
              </div>
            </div>

            <ul className="mt-6 flex flex-col gap-3">
              {result.criteria.map((c) => {
                const active = c.key === activeCriterion;
                const color = colorFor(c.key);
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => setActiveCriterion(active ? null : c.key)}
                      className="w-full rounded-lg border p-3 text-left"
                      style={{ borderColor: active ? color : "var(--color-border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold">{c.title}</span>
                        <span className="text-sm font-bold" style={{ color }}>
                          {c.score}/5
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full"
                        style={{ backgroundColor: "var(--color-surface-sunken)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(c.score / 5) * 100}%`, backgroundColor: color }}
                        />
                      </div>
                      <p
                        className="mt-2 text-xs leading-5"
                        style={{ color: "var(--color-fg-muted)" }}
                      >
                        {c.rationale}
                      </p>
                    </button>
                    {active && (
                      <div className="mt-2 rounded-lg border p-3 text-xs leading-6">
                        <p className="font-semibold">Evidence in this resume</p>
                        {activeEvidence.length === 0 ? (
                          <p style={{ color: "var(--color-fg-muted)" }}>
                            No quoted evidence for this criterion.
                          </p>
                        ) : (
                          <ul className="mt-1 list-inside list-disc">
                            {activeEvidence.map((e, i) => (
                              <li key={i}>“{e.quotedText}”</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Resume with evidence highlighted
            </h2>
            <div className="mt-3 rounded-lg border p-4">
              <HighlightedResume text={selected.text} spans={spans} />
            </div>
            {spans.size > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--color-fg-muted)" }}>
                Highlighted spans are the exact character offsets the model quoted. Click a
                criterion to see its quotes.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
