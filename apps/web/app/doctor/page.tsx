"use client";

import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { type DoctorHistoryRow, type DoctorReport, runDoctor } from "@/lib/api";

/**
 * Resume Doctor (phase 2 flagship, candidate-side).
 *
 * Paste or upload a resume, get the deterministic 0–100 score with every
 * flag pinned to the exact line of text it refers to, plus this org's
 * score history for the same text. Mobile-first: score and headline
 * first, text with inline flags second, filters last.
 */

const SEVERITY_COLOR: Record<string, string> = {
  fail: "var(--color-danger, #e5484d)",
  warn: "var(--color-warning, #f5a623)",
  info: "var(--color-fg-muted, var(--hl-muted, #888))",
};

const CATEGORY_LABELS: Record<string, string> = {
  contact: "Contact",
  structure: "Structure",
  dates: "Dates",
  impact: "Impact",
  brevity: "Brevity",
  parse: "Parseability",
};

function bandColor(band: DoctorReport["band"]): string {
  if (band === "excellent") return "var(--color-success, #30a46c)";
  if (band === "good") return "var(--color-warning, #f5a623)";
  return "var(--color-danger, #e5484d)";
}

/** Render the resume text with flagged line spans highlighted. */
function FlaggedResume({
  text,
  findings,
  activeCode,
  onSelect,
}: {
  text: string;
  findings: DoctorReport["findings"];
  activeCode: string | null;
  onSelect: (code: string | null) => void;
}) {
  const nodes: React.ReactNode[] = [];
  const flagged = findings.filter((f) => f.startOffset !== null && f.endOffset !== null);
  const starts: Array<{ code: string; start: number; end: number; severity: string }> = [];
  for (const f of flagged) {
    if (f.startOffset === null || f.endOffset === null) continue;
    starts.push({ code: f.code, start: f.startOffset, end: f.endOffset, severity: f.severity });
  }
  starts.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const item of starts) {
    if (item.start < cursor) continue; // overlapping flag — first wins
    if (item.start > cursor) nodes.push(text.slice(cursor, item.start));
    const active = activeCode === item.code;
    nodes.push(
      <mark
        key={item.code}
        onClick={() => onSelect(active ? null : item.code)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect(active ? null : item.code);
        }}
        className="cursor-pointer rounded px-0.5 transition-colors"
        style={{
          backgroundColor: active
            ? SEVERITY_COLOR[item.severity]
            : `color-mix(in oklab, ${SEVERITY_COLOR[item.severity]} 18%, transparent)`,
          color: active ? "#fff" : "inherit",
        }}
      >
        {text.slice(item.start, item.end)}
      </mark>,
    );
    cursor = item.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-6">{nodes}</pre>
  );
}

export default function DoctorPage() {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [history, setHistory] = useState<DoctorHistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async () => {
    if (text.trim().length === 0) return;
    setPending(true);
    setError(null);
    setActiveCode(null);
    try {
      const res = await runDoctor(text);
      setReport(res.report);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — is the API running?");
    } finally {
      setPending(false);
    }
  }, [text]);

  const readFile = useCallback(async (file: File) => {
    // Plain text formats only (txt/md). PDF/DOCX extraction lives server-
    // side in the full ingest flow; the doctor page keeps it simple by
    // accepting raw text. Read as UTF-8, cap at 200 KB to match the API.
    if (file.size > 200_000) {
      setError("File too large — the doctor accepts up to 200 KB of text.");
      return;
    }
    const content = await file.text();
    setText(content);
    setError(null);
  }, []);

  const visibleFindings = report
    ? categoryFilter
      ? report.findings.filter((f) => f.category === categoryFilter)
      : report.findings
    : [];

  const categories = report ? [...new Set(report.findings.map((f) => f.category))] : [];

  return (
    <AppShell>
      <header>
        <p className="text-xs uppercase tracking-widest" style={{ color: "var(--hl-muted)" }}>
          Deterministic · no LLM · same text, same score
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Resume Doctor</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--hl-muted)" }}>
          Paste (or drop) a resume and get its fixable problems — contact, structure, dates, impact,
          brevity — each pinned to the exact line. Score bands: excellent ≥ 85, good ≥ 60,
          needs_work below.
        </p>
      </header>

      <section className="mt-6" aria-label="Input">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your resume text here…"
          rows={8}
          className="w-full rounded-lg border p-3 font-mono text-[13px] leading-6"
          style={{
            borderColor: "var(--hl-border)",
            background: "var(--hl-card, transparent)",
            color: "var(--hl-cream)",
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={pending || text.trim().length === 0}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--hl-accent)", color: "var(--hl-ink)" }}
          >
            {pending ? "Analyzing…" : "Run the doctor"}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border px-4 py-2 text-sm transition-colors"
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
          >
            Upload .txt / .md
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
          <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
            or drag a file here
          </span>
        </div>
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--hl-bad, #e5484d)" }}>
            {error}
          </p>
        )}
      </section>

      {report && (
        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Score + findings */}
          <section aria-label="Results">
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-3xl font-bold"
                style={{
                  background: "var(--hl-card, var(--color-surface-sunken))",
                  color: bandColor(report.band),
                }}
                role="status"
                aria-label={`Score ${report.score} out of 100, band ${report.band}`}
              >
                {report.score}
              </div>
              <div>
                <p className="font-semibold capitalize">{report.band.replace("_", " ")}</p>
                <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
                  {report.findings.length} finding{report.findings.length === 1 ? "" : "s"}
                  {report.findings.some((f) => f.severity === "fail")
                    ? ` · ${report.findings.filter((f) => f.severity === "fail").length} blocking`
                    : ""}
                </p>
              </div>
            </div>

            {report.nextSteps.length > 0 && (
              <div className="mt-5">
                <h2
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--hl-muted)" }}
                >
                  Fix first
                </h2>
                <ol className="mt-2 list-inside list-decimal text-sm leading-6">
                  {report.nextSteps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {categories.length > 1 && (
              <div
                className="mt-5 flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by category"
              >
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className="rounded-full border px-3 py-1 text-xs"
                  style={{
                    borderColor: categoryFilter === null ? "var(--hl-accent)" : "var(--hl-border)",
                    color: categoryFilter === null ? "var(--hl-accent)" : "var(--hl-muted)",
                  }}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                    className="rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: cat === categoryFilter ? "var(--hl-accent)" : "var(--hl-border)",
                      color: cat === categoryFilter ? "var(--hl-accent)" : "var(--hl-muted)",
                    }}
                  >
                    {CATEGORY_LABELS[cat] ?? cat}
                  </button>
                ))}
              </div>
            )}

            <ul className="mt-4 flex flex-col gap-2">
              {visibleFindings.map((f) => {
                const active = activeCode === f.code;
                return (
                  <li key={f.code}>
                    <button
                      type="button"
                      onClick={() => setActiveCode(active ? null : f.code)}
                      className="w-full rounded-lg border p-3 text-left transition-colors"
                      style={{
                        borderColor: active ? SEVERITY_COLOR[f.severity] : "var(--hl-border)",
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{f.title}</span>
                        <span
                          className="shrink-0 text-[10px] font-bold uppercase tracking-wide"
                          style={{ color: SEVERITY_COLOR[f.severity] }}
                        >
                          {f.severity}
                          {f.penalty > 0 ? ` −${f.penalty}` : ""}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5" style={{ color: "var(--hl-muted)" }}>
                        {f.detail}
                      </p>
                      {f.line !== null && (
                        <p className="mt-1 text-[10px]" style={{ color: "var(--hl-muted)" }}>
                          Line {f.line}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
              {visibleFindings.length === 0 && (
                <li
                  className="rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--hl-border)" }}
                >
                  Nothing flagged in this category.
                </li>
              )}
            </ul>

            {history.length > 1 && (
              <div className="mt-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--hl-muted)" }}
                >
                  Score history for this text
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between rounded border px-3 py-1.5"
                      style={{ borderColor: "var(--hl-border)" }}
                    >
                      <span style={{ color: "var(--hl-muted)" }}>
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                      <span
                        className="font-semibold"
                        style={{
                          color: bandColor(
                            h.band === "excellent"
                              ? "excellent"
                              : h.band === "good"
                                ? "good"
                                : "needs_work",
                          ),
                        }}
                      >
                        {h.score} · {h.findingCount} findings
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Text with inline flags */}
          <section aria-label="Resume with flags highlighted">
            <h2
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--hl-muted)" }}
            >
              Your resume, flags pinned inline
            </h2>
            <div
              role="region"
              aria-label="Resume with flags highlighted"
              tabIndex={-1}
              className="mt-3 rounded-lg border p-4"
              style={{ borderColor: "var(--hl-border)" }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
              data-dragover={dragOver}
            >
              <FlaggedResume
                text={text}
                findings={report.findings}
                activeCode={activeCode}
                onSelect={setActiveCode}
              />
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--hl-muted)" }}>
              Click a flag (or a finding) to focus it. Red = must fix, amber = worth fixing, grey =
              note.
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
