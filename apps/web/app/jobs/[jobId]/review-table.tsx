"use client";

import { Button, OverallScore } from "@hirelens/ui";
import { Info } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { trackEvent } from "@/lib/analytics";
import { getReview, postDecision, type ReviewRow, type Stage } from "@/lib/api";
import { cap } from "@/lib/format";

const STAGE_STYLE: Record<Stage, { bg: string; fg: string; border?: string }> = {
  new: { bg: "transparent", fg: "var(--color-fg-muted)", border: "var(--hl-border)" },
  shortlisted: {
    bg: "color-mix(in oklab, var(--color-warning) 18%, transparent)",
    fg: "var(--color-warning)",
  },
  advanced: {
    bg: "color-mix(in oklab, var(--color-success) 18%, transparent)",
    fg: "var(--color-success)",
  },
  rejected: {
    bg: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
    fg: "var(--color-danger)",
  },
};

const STAGES: Stage[] = ["shortlisted", "advanced", "rejected"];

function csvEscape(v: string | number | null): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function ReviewTable({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [blind, setBlind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reasonFor, setReasonFor] = useState<{ id: string; stage: Stage } | null>(null);
  const [reason, setReason] = useState("");
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getReview(jobId);
      setRows([...res.review].sort((a, b) => b.overall - a.overall));
    } catch (err) {
      setError(err);
    }
  }, [jobId]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);

  async function decide(stage: Stage, id: string) {
    setReasonFor({ id, stage });
    setReason("");
  }

  async function submitReason(e: React.FormEvent) {
    e.preventDefault();
    if (!reasonFor || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      await postDecision(jobId, {
        candidateId: reasonFor.id,
        stage: reasonFor.stage,
        reason: reason.trim(),
      });
      trackEvent("decision.recorded", { jobId, stage: reasonFor.stage });
      setReasonFor(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Keyboard loop: J/K move the cursor, A shortlists, R rejects, X advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reasonFor) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "j" || e.key === "J") setCursor((c) => Math.min(c + 1, rows.length - 1));
      else if (e.key === "k" || e.key === "K") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === "a" || e.key === "A") {
        const row = rows[cursor];
        if (row) void decide("shortlisted", row.candidateId);
      } else if (e.key === "r" || e.key === "R") {
        const row = rows[cursor];
        if (row) void decide("rejected", row.candidateId);
      } else if (e.key === "x" || e.key === "X") {
        const row = rows[cursor];
        if (row) void decide("advanced", row.candidateId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, reasonFor]);

  function exportCsv() {
    const header = "rank,label,candidate_id,overall,stage,overridden_scores,criteria";
    const lines = rows.map((r, i) =>
      [
        i + 1,
        blind ? `Candidate ${i + 1}` : (r.label ?? `candidate-${r.candidateId.slice(0, 8)}`),
        r.candidateId,
        Math.round(r.overall),
        r.stage,
        r.overridden,
        r.criteria,
      ]
        .map(csvEscape)
        .join(","),
    );
    const blob = new Blob([`${header}\n${lines.join("\n")}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens-review-${jobId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = {
      jobId,
      exportedAt: new Date().toISOString(),
      blind,
      ranking: rows.map((r, i) => ({
        rank: i + 1,
        ...r,
        label: blind ? `Candidate ${i + 1}` : r.label,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens-review-${jobId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function displayName(r: ReviewRow, i: number): string {
    if (blind) return `Candidate ${i + 1}`;
    return r.label ?? `Candidate ${r.candidateId.slice(0, 8)}`;
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-[var(--hl-cream)]">Review queue</h2>
        <div className="flex items-center gap-2">
          <label
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--color-fg-muted)" }}
            title="Hide candidate names while you decide, so first impressions don't bias you. Turn it off to reveal them."
          >
            <input
              type="checkbox"
              checked={blind}
              onChange={(e) => setBlind(e.target.checked)}
              className="accent-[var(--hl-accent)]"
            />
            Blind review
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportJson} disabled={rows.length === 0}>
            Export JSON
          </Button>
        </div>
      </div>

      <p
        className="flex items-center gap-1 text-xs"
        style={{ color: "var(--color-fg-muted)" }}
        title="Keyboard shortcuts: J / K move between candidates · A shortlists · X advances · R rejects"
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
        Keyboard shortcuts available
      </p>

      {error ? <NoticeBanner error={error} /> : null}

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          No scored candidates yet — run scoring above to populate the review queue.
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-[var(--radius-card)] border"
          style={{ borderColor: "var(--hl-border)" }}
        >
          {rows.map((r, i) => (
            <div
              key={r.candidateId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid var(--hl-border)" : undefined,
                background: i === cursor ? "var(--color-surface-raised)" : undefined,
              }}
            >
              <span className="w-6 text-sm tabular-nums" style={{ color: "var(--color-fg-muted)" }}>
                {i + 1}
              </span>
              <a
                href={
                  blind
                    ? `/jobs/${jobId}/candidates/${r.candidateId}?blind=1`
                    : `/jobs/${jobId}/candidates/${r.candidateId}`
                }
                className="max-w-[220px] truncate text-sm font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--color-accent)" }}
                title={blind ? "Blinded — open to read the masked resume" : displayName(r, i)}
              >
                {displayName(r, i)}
              </a>
              <OverallScore score={r.overall} label={`Candidate rank ${i + 1} overall`} />
              {r.overridden > 0 && (
                <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                  {r.overridden} override{r.overridden > 1 ? "s" : ""}
                </span>
              )}
              <span
                className="rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium"
                style={{
                  background: STAGE_STYLE[r.stage].bg,
                  color: STAGE_STYLE[r.stage].fg,
                  ...(STAGE_STYLE[r.stage].border
                    ? { border: `1px solid ${STAGE_STYLE[r.stage].border}` }
                    : {}),
                }}
              >
                {cap(r.stage)}
              </span>
              <span className="flex gap-1.5">
                {STAGES.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    disabled={busy || r.stage === s}
                    onClick={() => void decide(s, r.candidateId)}
                  >
                    {s === "shortlisted" ? "Shortlist" : s === "advanced" ? "Advance" : "Reject"}
                  </Button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {reasonFor && (
        <form
          onSubmit={submitReason}
          className="flex flex-col gap-2 rounded-[var(--radius-card)] border p-4"
          style={{
            borderColor: "var(--hl-border)",
            background: "var(--hl-ink-3)",
          }}
        >
          <p className="text-sm font-medium text-[var(--hl-cream)]">
            Reason for {reasonFor.stage.toLowerCase()} — required for the audit record.
          </p>
          <textarea
            rows={2}
            minLength={3}
            maxLength={2000}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this decision? (recorded in the audit log)"
            className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] placeholder:text-[var(--hl-muted)] focus:outline-none focus:border-[var(--hl-accent)] focus:ring-2 focus:ring-[var(--hl-accent-soft)]"
            style={{
              borderColor: "var(--hl-border)",
              background: "var(--hl-input)",
            }}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || reason.trim().length < 3}>
              Record decision
            </Button>
            <Button type="button" variant="ghost" onClick={() => setReasonFor(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
