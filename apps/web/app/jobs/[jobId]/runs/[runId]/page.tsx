"use client";

import { Card, CardContent, CardHeader, CardTitle, OverallScore, ScoreBadge } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { getCandidate, getRun, type RunCandidate } from "@/lib/api";
import { candidateLabel, cap, modelLabel } from "@/lib/format";

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

/** "system-design" → "System design". */
function criterionTitle(key: string): string {
  return key
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Horizontal 0–5 meter with the score-ramp color and the numeric value beside it. */
function ScoreMeter({ score, title }: { score: number; title: string }) {
  const level = Math.min(5, Math.max(0, Math.round(score)));
  return (
    <div
      role="img"
      aria-label={`${title}: score ${level} of 5`}
      className="flex items-center gap-2"
    >
      <div
        aria-hidden
        className="h-1.5 w-24 overflow-hidden rounded-full"
        style={{ background: "var(--hl-ink-3)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${(level / 5) * 100}%`,
            background: `var(--color-score-${level})`,
          }}
        />
      </div>
      <ScoreBadge score={score} label={title} />
    </div>
  );
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
  const [docName, setDocName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
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
        setError(err);
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
        setDocName(detail.candidate?.sourceFileKey?.split("/").pop() ?? null);
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
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <Link
            href={`/jobs/${jobId}`}
            className="text-sm transition-colors hover:text-[var(--hl-cream)]"
            style={{ color: "var(--hl-mist)" }}
          >
            ← Job
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
            Scoring results
          </h1>
          {runMeta && (
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-fg-muted)" }}>
              Rubric v{runMeta.rubricVersion} · {modelLabel(runMeta.modelId)} ·{" "}
              {cap(runMeta.status)}
            </p>
          )}
        </header>

        {error ? <NoticeBanner error={error} /> : null}

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
                className={
                  c.candidateId === selected
                    ? "ring-2 ring-[var(--color-accent)]"
                    : "transition-colors hover:border-[var(--color-border-strong)]"
                }
                style={{
                  background: "var(--hl-card)",
                  borderColor: "var(--hl-border)",
                  cursor: "pointer",
                }}
              >
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => setSelected(c.candidateId)}
                    aria-expanded={c.candidateId === selected}
                  >
                    <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                      {c.label ?? candidateLabel(c.candidateId, null)}
                    </CardTitle>
                  </button>
                  <OverallScore
                    score={c.overall}
                    label={`${c.label ?? c.candidateId.slice(0, 8)} overall`}
                  />
                </CardHeader>
                {c.candidateId === selected && (
                  <CardContent className="flex flex-col gap-3">
                    {c.criteria.map((s) => (
                      <div
                        key={s.id}
                        className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-0"
                        style={{ borderColor: "var(--hl-border)" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--hl-cream)" }}
                          >
                            {criterionTitle(s.criterionKey)}
                          </span>
                          <ScoreMeter score={s.score} title={s.criterionKey} />
                        </div>
                        {s.rationale && (
                          <p
                            className="text-xs leading-5"
                            style={{ color: "var(--color-fg-muted)" }}
                          >
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
                              className="rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors"
                              style={{
                                background: "var(--hl-ink-3)",
                                color: focus === id ? "var(--hl-accent)" : "var(--hl-mist)",
                                border: "1px solid var(--hl-border)",
                              }}
                              title="Show this quote in the resume"
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
            <Card
              className="sticky top-20"
              style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
            >
              <CardHeader>
                <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                  {docName ? `Extracted text — ${docName}` : "Extracted text"}
                </CardTitle>
                <p className="text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
                  The AI reads exactly this extracted text — your original file is never altered.
                  Highlighted passages are the evidence behind the scores; click one to jump here.
                </p>
              </CardHeader>
              <CardContent>
                {docText === null ? (
                  <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                    Loading resume…
                  </p>
                ) : (
                  <pre
                    className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl p-3 font-mono text-xs leading-5"
                    style={{ background: "var(--hl-ink-2)", color: "var(--color-fg)" }}
                  >
                    {segments.map((p, i) =>
                      p.span ? (
                        <mark
                          key={i}
                          id={`ev-${p.span.start}-${p.span.end}`}
                          style={{
                            background:
                              focus === `ev-${p.span.start}-${p.span.end}`
                                ? "var(--hl-accent)"
                                : "color-mix(in oklab, var(--hl-accent) 24%, transparent)",
                            color:
                              focus === `ev-${p.span.start}-${p.span.end}`
                                ? "var(--hl-ink)"
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
      </div>
    </AppShell>
  );
}
