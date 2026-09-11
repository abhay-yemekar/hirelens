"use client";

import { Card, CardContent, CardHeader, CardTitle, OverallScore, ScoreBadge } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCandidate, getRun, type RunCandidate } from "@/lib/api";

interface Span {
  start: number;
  end: number;
}

/** Merge overlapping spans so highlights never double-render. */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** Split text into plain/highlighted segments for span rendering. */
function segment(text: string, spans: Span[]) {
  const parts: Array<{ text: string; span?: Span }> = [];
  let cursor = 0;
  for (const s of mergeSpans(spans)) {
    const start = Math.min(Math.max(s.start, 0), text.length);
    const end = Math.min(Math.max(s.end, 0), text.length);
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: text.slice(start, end), span: { start, end } });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export default function RunPage() {
  const params = useParams<{ jobId: string; runId: string }>();
  const jobId = params.jobId;
  const runId = params.runId;

  const [candidates, setCandidates] = useState<RunCandidate[]>([]);
  const [runMeta, setRunMeta] = useState<{
    modelId: string;
    rubricVersion: number;
    status: string;
  } | null>(null);
  const [docText, setDocText] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const res = await getRun(jobId, runId);
        setCandidates(res.candidates);
        setRunMeta({
          modelId: res.run.modelId,
          rubricVersion: res.run.rubricVersion,
          status: res.run.status,
        });
        const first = res.candidates[0]?.candidateId ?? null;
        setSelected((prev) => prev ?? first);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run");
      }
    })();
  }, [jobId, runId]);

  // Load the selected candidate's resume text (the evidence target).
  useEffect(() => {
    if (!selected) return;
    (async () => {
      try {
        const detail = await getCandidate(jobId, selected);
        setDocText(detail.documents[0]?.rawText ?? "");
      } catch {
        setDocText(null);
      }
    })();
  }, [jobId, selected]);

  const current = useMemo(
    () => candidates.find((c) => c.candidateId === selected) ?? null,
    [candidates, selected],
  );

  const allSpans: Span[] = useMemo(
    () =>
      (current?.criteria ?? []).flatMap((s) =>
        s.evidence.map((e) => ({ start: e.startOffset, end: e.endOffset })),
      ),
    [current],
  );

  const segments = useMemo(() => (docText ? segment(docText, allSpans) : []), [docText, allSpans]);

  const jumpTo = useCallback((start: number, end: number) => {
    const id = `ev-${start}-${end}`;
    setFocus(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFocus(null), 1600);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href={`/jobs/${jobId}`}
            className="text-sm"
            style={{ color: "var(--color-fg-muted)" }}
          >
            ← Job
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Scoring run</h1>
          {runMeta && (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              rubric v{runMeta.rubricVersion} · {runMeta.modelId} · {runMeta.status}
            </p>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: candidates + criteria */}
        <section className="flex flex-col gap-4">
          {candidates.length === 0 && !error && (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              No scored candidates in this run.
            </p>
          )}
          {candidates.map((c) => (
            <Card
              key={c.candidateId}
              className={c.candidateId === selected ? "ring-2" : ""}
              style={
                c.candidateId === selected
                  ? { outline: "2px solid var(--color-accent)" }
                  : undefined
              }
            >
              <CardHeader className="flex-row items-center justify-between">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setSelected(c.candidateId)}
                >
                  <CardTitle className="text-base">Candidate {c.candidateId.slice(0, 8)}</CardTitle>
                </button>
                <OverallScore
                  score={c.overall}
                  label={`Candidate ${c.candidateId.slice(0, 8)} overall`}
                />
              </CardHeader>
              {c.candidateId === selected && (
                <CardContent className="flex flex-col gap-3">
                  {c.criteria.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0"
                      style={{ borderColor: "var(--color-border-subtle)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm">{s.criterionKey}</span>
                        <ScoreBadge score={s.score} label={s.criterionKey} />
                      </div>
                      {s.rationale && (
                        <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                          {s.rationale}
                        </p>
                      )}
                      {s.evidence.map((e) => {
                        const id = `ev-${e.startOffset}-${e.endOffset}`;
                        return (
                          <button
                            key={`${s.id}-${e.startOffset}-${e.endOffset}`}
                            type="button"
                            onClick={() => jumpTo(e.startOffset, e.endOffset)}
                            className="rounded px-2 py-1 text-left font-mono text-xs"
                            style={{
                              background: "var(--color-surface-sunken)",
                              color: focus === id ? "var(--color-accent)" : "var(--color-fg)",
                              border: "1px solid var(--color-border-subtle)",
                            }}
                          >
                            “{e.quotedText}”
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </section>

        {/* Right: resume with highlighted evidence */}
        <section>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">Resume evidence</CardTitle>
            </CardHeader>
            <CardContent>
              {docText === null ? (
                <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                  Loading resume…
                </p>
              ) : (
                <pre
                  className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5"
                  style={{ color: "var(--color-fg)" }}
                >
                  {segments.map((p, i) =>
                    p.span ? (
                      <mark
                        key={i}
                        id={`ev-${p.span.start}-${p.span.end}`}
                        style={{
                          background:
                            focus === `ev-${p.span.start}-${p.span.end}`
                              ? "var(--color-accent)"
                              : "color-mix(in oklab, var(--color-accent) 22%, transparent)",
                          color:
                            focus === `ev-${p.span.start}-${p.span.end}`
                              ? "var(--color-accent-fg)"
                              : "inherit",
                          borderRadius: 3,
                          transition: "background 0.25s var(--ease-spring, ease)",
                        }}
                      >
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </pre>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
