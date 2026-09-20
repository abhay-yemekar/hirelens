"use client";

import { Card, CardContent, CardHeader, CardTitle, OverallScore, ScoreBadge } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { getCandidate, getRun, interviewKitHtmlUrl, type RunCandidate } from "@/lib/api";
import { candidateLabel, cap, fileLabel, modelLabel } from "@/lib/format";

import { SharePanel } from "./share-panel";

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

/**
 * Side-by-side comparison of 2–3 scored candidates: criteria as rows,
 * candidates as columns. The best overall score is accented so the
 * trade-offs (and the winner) read at a glance.
 */
function CompareTable({
  candidates,
  onRemove,
}: {
  candidates: RunCandidate[];
  onRemove: (candidateId: string) => void;
}) {
  const keys = useMemo(() => {
    const seen: string[] = [];
    for (const c of candidates)
      for (const s of c.criteria) if (!seen.includes(s.criterionKey)) seen.push(s.criterionKey);
    return seen;
  }, [candidates]);
  const best = Math.max(...candidates.map((c) => c.overall));

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
          Compare ({candidates.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="px-2 pb-3 text-left text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Criterion
              </th>
              {candidates.map((c) => (
                <th
                  key={c.candidateId}
                  scope="col"
                  className="px-2 pb-3 text-left"
                  style={{ color: "var(--hl-cream)" }}
                >
                  <span className="flex items-center gap-2">
                    {c.label ?? candidateLabel(c.candidateId, null)}
                    <button
                      type="button"
                      aria-label={`Remove ${c.label ?? c.candidateId} from comparison`}
                      onClick={() => onRemove(c.candidateId)}
                      className="rounded px-1 text-xs transition-colors hover:text-[var(--hl-cream)]"
                      style={{ color: "var(--color-fg-muted)" }}
                    >
                      ✕
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key} className="border-t" style={{ borderColor: "var(--hl-border)" }}>
                <td className="px-2 py-2.5 font-medium" style={{ color: "var(--hl-cream)" }}>
                  {criterionTitle(key)}
                </td>
                {candidates.map((c) => {
                  const s = c.criteria.find((x) => x.criterionKey === key);
                  return (
                    <td key={c.candidateId} className="px-2 py-2.5">
                      {s ? (
                        <ScoreMeter score={s.score} title={key} />
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t" style={{ borderColor: "var(--hl-border)" }}>
              <td
                className="px-2 py-3 text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Overall
              </td>
              {candidates.map((c) => (
                <td key={c.candidateId} className="px-2 py-3">
                  <span
                    className="text-lg font-semibold"
                    style={{
                      color: c.overall === best ? "var(--hl-accent)" : "var(--hl-cream)",
                    }}
                  >
                    {Math.round(c.overall)}
                  </span>
                  {c.overall === best && candidates.length > 1 && (
                    <span
                      className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: "var(--hl-accent)", color: "var(--hl-ink)" }}
                    >
                      top
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
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
  const [compare, setCompare] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
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
        setDocName(fileLabel(detail.candidate?.sourceFileKey ?? null));
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

        <SharePanel jobId={jobId} />

        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={interviewKitHtmlUrl(jobId, runId, current.candidateId)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
              style={{
                borderColor: "var(--hl-accent)",
                color: "var(--hl-accent)",
              }}
              title="Opens a printable debrief pack: probes from the rubric's anchored scale, what strong looks like, and the exact quotes the model scored."
            >
              Interview kit — {current.label ?? current.candidateId.slice(0, 8)} ↗
            </a>
            <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              Printable debrief: probes, anchors, and the evidence behind every score.
            </span>
          </div>
        ) : null}

        {compareMode && compare.length >= 2 ? (
          <CompareTable
            candidates={compare
              .map((id) => candidates.find((c) => c.candidateId === id))
              .filter((c): c is RunCandidate => Boolean(c))}
            onRemove={(id) => setCompare((prev) => prev.filter((x) => x !== id))}
          />
        ) : null}

        {candidates.length >= 2 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-pressed={compareMode}
              onClick={() => setCompareMode((m) => !m)}
              className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                compareMode
                  ? {
                      background: "var(--hl-accent)",
                      color: "var(--hl-ink)",
                      borderColor: "var(--hl-accent)",
                    }
                  : {
                      background: "transparent",
                      color: "var(--hl-cream)",
                      borderColor: "var(--hl-border)",
                    }
              }
            >
              Compare
            </button>
            {compareMode ? (
              <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                {compare.length < 2
                  ? "Select at least 2 candidates below"
                  : `${compare.length} selected — pick up to 3`}
              </span>
            ) : null}
          </div>
        ) : null}

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
                role="button"
                tabIndex={0}
                aria-pressed={c.candidateId === selected}
                aria-label={`Show ${c.label ?? candidateLabel(c.candidateId, null)} — scored ${Math.round(c.overall)} of 100`}
                onClick={() => setSelected(c.candidateId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(c.candidateId);
                  }
                }}
                className={
                  c.candidateId === selected
                    ? "ring-2 ring-[var(--color-accent)]"
                    : "cursor-pointer transition-colors hover:border-[var(--color-border-strong)]"
                }
                style={{
                  background: "var(--hl-card)",
                  borderColor: "var(--hl-border)",
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
                  <span className="flex items-center gap-3">
                    {compareMode && candidates.length >= 2 ? (
                      <label
                        className="flex cursor-pointer items-center gap-1.5 text-xs"
                        style={{ color: "var(--color-fg-muted)" }}
                      >
                        <input
                          type="checkbox"
                          checked={compare.includes(c.candidateId)}
                          disabled={!compare.includes(c.candidateId) && compare.length >= 3}
                          onChange={(e) =>
                            setCompare((prev) =>
                              e.target.checked
                                ? [...prev, c.candidateId]
                                : prev.filter((x) => x !== c.candidateId),
                            )
                          }
                        />
                        Compare
                      </label>
                    ) : null}
                    <OverallScore
                      score={c.overall}
                      label={`${c.label ?? c.candidateId.slice(0, 8)} overall`}
                    />
                  </span>
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
                    role="region"
                    className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl p-3 font-mono text-xs leading-5"
                    style={{ background: "var(--hl-ink-2)", color: "var(--color-fg)" }}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG scrollable regions must be keyboard-focusable (axe-verified)
                    tabIndex={0}
                    aria-label="Extracted resume text, scrollable"
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
