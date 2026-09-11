"use client";

import { Button, OverallScore } from "@hirelens/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { getReview, postDecision, type ReviewRow, type Stage } from "@/lib/api";

const STAGE_STYLE: Record<Stage, { bg: string; fg: string }> = {
  new: { bg: "var(--color-surface-sunken)", fg: "var(--color-fg-muted)" },
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

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function ReviewTable({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [blind, setBlind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<{ id: string; stage: Stage } | null>(null);
  const [reason, setReason] = useState("");
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getReview(jobId);
      setRows([...res.review].sort((a, b) => b.overall - a.overall));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review table");
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
      setReasonFor(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record decision");
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
    const header = "rank,candidate_id,overall,stage,overridden_scores,criteria";
    const lines = rows.map((r, i) =>
      [i + 1, r.candidateId, Math.round(r.overall), r.stage, r.overridden, r.criteria]
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
      ranking: rows.map((r, i) => ({ rank: i + 1, ...r })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens-review-${jobId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Review queue</h2>
        <div className="flex items-center gap-2">
          <label
            className="flex items-center gap-1 text-sm"
            style={{ color: "var(--color-fg-muted)" }}
          >
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            Blind review
          </label>
          <Button variant="ghost" onClick={exportCsv}>
            CSV
          </Button>
          <Button variant="ghost" onClick={exportJson}>
            JSON
          </Button>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
        Shortcuts: <kbd>J</kbd>/<kbd>K</kbd> move · <kbd>A</kbd> shortlist · <kbd>X</kbd> advance ·{" "}
        <kbd>R</kbd> reject
      </p>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          No scored candidates yet — run scoring to populate the review queue.
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-[var(--radius-card)] border"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          {rows.map((r, i) => (
            <div
              key={r.candidateId}
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{
                borderBottom:
                  i < rows.length - 1 ? "1px solid var(--color-border-subtle)" : undefined,
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
                className="font-mono text-sm underline-offset-2 hover:underline"
                style={{ color: "var(--color-accent)" }}
              >
                {blind ? `candidate-${i + 1}` : `candidate-${r.candidateId.slice(0, 8)}`}
              </a>
              <OverallScore score={r.overall} label={`Candidate rank ${i + 1} overall`} />
              {r.overridden > 0 && (
                <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                  {r.overridden} override{r.overridden > 1 ? "s" : ""}
                </span>
              )}
              <span
                className="rounded-[var(--radius-pill)] px-2 py-0.5 text-xs"
                style={{ background: STAGE_STYLE[r.stage].bg, color: STAGE_STYLE[r.stage].fg }}
              >
                {r.stage}
              </span>
              <span className="flex gap-1">
                {STAGES.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
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
            borderColor: "var(--color-border-strong)",
            background: "var(--color-surface-raised)",
          }}
        >
          <p className="text-sm font-medium">
            Reason for {reasonFor.stage} — required for the audit record.
          </p>
          <textarea
            rows={2}
            minLength={3}
            maxLength={2000}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this decision? (recorded in the audit log)"
            className="rounded-[var(--radius-control)] border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--color-border-subtle)",
              background: "var(--color-surface)",
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
