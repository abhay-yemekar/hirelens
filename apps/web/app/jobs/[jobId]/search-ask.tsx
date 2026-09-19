"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { trackEvent } from "@/lib/analytics";
import {
  type AskResponse,
  askQuestion,
  indexJobResumes,
  type SearchResponse,
  searchCandidates,
} from "@/lib/api";

type Mode = "search" | "ask";

/**
 * Search & Ask: type a natural-language question ("who has Kubernetes and
 * Terraform experience?") and get the matching candidates — ranked by
 * semantic similarity when embeddings are configured, by keyword matching
 * otherwise. Ask mode summarizes with an LLM answer and cites candidates.
 */
export function SearchAskCard({ jobId }: { jobId: string }) {
  const [mode, setMode] = useState<Mode>("ask");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [ask, setAsk] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [indexNote, setIndexNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced live search in search mode.
  useEffect(() => {
    if (mode !== "search" || q.trim().length < 2) {
      setSearch(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setError(null);
        try {
          setSearch(await searchCandidates(jobId, q.trim()));
        } catch (err) {
          setError(err);
        }
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [jobId, q, mode]);

  async function runAsk() {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setAsk(null);
    try {
      trackEvent("ask.ran", { jobId });
      setAsk(await askQuestion(jobId, q.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function backfill() {
    setBusy(true);
    setError(null);
    try {
      const res = await indexJobResumes(jobId);
      setIndexNote(`Indexed ${res.indexed} of ${res.total} resumes for semantic search.`);
      trackEvent("search.indexed", { jobId });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const hits = search?.hits ?? [];

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Search &amp; Ask</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Ask anything about the uploaded resumes — "who has Kubernetes production experience?",
          "find candidates who led a team". You get the matching candidates with the passages that
          answer you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "ask") void runAsk();
          }}
        >
          <div
            role="tablist"
            aria-label="Search mode"
            className="flex flex-none rounded-[var(--radius-control)] border p-0.5"
            style={{ borderColor: "var(--hl-border)" }}
          >
            {(["ask", "search"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setSearch(null);
                  setAsk(null);
                }}
                className="rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  mode === m
                    ? { background: "var(--hl-accent)", color: "var(--hl-ink)" }
                    : { color: "var(--hl-mist)" }
                }
              >
                {m === "ask" ? "Ask AI" : "Search"}
              </button>
            ))}
          </div>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={500}
            placeholder={
              mode === "ask"
                ? "e.g. Who has led a data platform migration?"
                : "e.g. kubernetes terraform"
            }
            aria-label={mode === "ask" ? "Ask a question" : "Search keywords"}
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] placeholder:text-[var(--hl-muted)] focus:border-[var(--hl-accent)] focus:outline-none"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
          />
          {mode === "ask" ? (
            <Button type="submit" disabled={busy || q.trim().length < 3}>
              {busy ? "Thinking…" : "Ask"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                setSearch(null);
                inputRef.current?.focus();
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {error ? <NoticeBanner error={error} /> : null}
        {indexNote && (
          <p role="status" className="text-xs" style={{ color: "var(--color-success)" }}>
            {indexNote}
          </p>
        )}

        {mode === "ask" && ask && (
          <div
            className="flex flex-col gap-2 rounded-[var(--radius-card)] border p-4"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-3)" }}
          >
            {ask.answer ? (
              <>
                <p className="text-sm leading-6" style={{ color: "var(--hl-cream)" }}>
                  {ask.answer}
                </p>
                {ask.confidence && (
                  <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
                    Confidence: {ask.confidence}
                  </p>
                )}
                {(ask.citations?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
                      Based on:
                    </span>
                    {(ask.citations ?? []).map((c) => (
                      <a
                        key={c.chunkId}
                        href={`/jobs/${jobId}/candidates/${c.candidateId}`}
                        className="rounded-full border px-2.5 py-1 text-xs font-medium underline-offset-2 transition-colors hover:bg-white/[0.06]"
                        style={{ borderColor: "var(--hl-border)", color: "var(--hl-accent)" }}
                      >
                        {c.label ?? `Candidate ${c.candidateId.slice(0, 8)}`}
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
                {ask.message ?? "No answer available."}
              </p>
            )}
          </div>
        )}

        {mode === "search" && search && (
          <div className="flex flex-col gap-2">
            <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
              {search.mode === "empty"
                ? "No resumes to search yet."
                : `${hits.length} match${hits.length === 1 ? "" : "es"} · ${search.mode}${
                    search.embeddingModel ? ` · ${search.embeddingModel}` : ""
                  }${search.indexed < search.total ? ` · ${search.total - search.indexed} not yet indexed` : ""}`}
            </p>
            {search.total > search.indexed && search.indexed === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={busy}
                onClick={backfill}
              >
                {busy ? "Indexing…" : "Index resumes for semantic search"}
              </Button>
            )}
            {hits.map((h) => (
              <a
                key={h.candidateId}
                href={`/jobs/${jobId}/candidates/${h.candidateId}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--hl-border)" }}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      background: "color-mix(in oklab, var(--hl-accent) 16%, transparent)",
                      color: "var(--hl-accent)",
                    }}
                  >
                    <Search aria-hidden className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--hl-cream)" }}
                  >
                    {h.label ?? `Candidate ${h.candidateId.slice(0, 8)}`}
                  </span>
                </span>
                <span
                  className="flex-none text-xs tabular-nums"
                  style={{ color: "var(--hl-muted)" }}
                  title="Relative match score"
                >
                  {Math.round(h.score * 100)}%
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
