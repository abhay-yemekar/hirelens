"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { createReportLink, listReportLinks, revokeReportLink } from "@/lib/api";

/** "2026-09-21T…" → "21 Sept" */
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Candidate report (v1.1) — recruiter side.
 *
 * Generates the per-candidate link the candidate opens (no account) to see
 * their own scores, the quoted evidence behind them, and the anchored scale.
 * Token shown exactly once; instant revoke; read counts visible. Every step
 * is hash-chain audited server-side.
 */
export function ReportPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<
    Array<{ id: string; revokedAt: string | null; readCount: number; createdAt: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    // Refreshes the links list only — the once-only token lives in state
    // set by create() and must never be cleared here (a stale closure wipe
    // here meant the recruiter could never see the URL to copy).
    try {
      const res = await listReportLinks(jobId, candidateId);
      setLinks(res.links);
    } catch (err) {
      setError(err);
    } finally {
      setLoaded(true);
    }
  }, [jobId, candidateId]);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [load, loaded]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await createReportLink(jobId, candidateId, {
        message: message.trim() || undefined,
      });
      setToken(res.link.token);
      setMessage("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    const url = `${window.location.origin}/report/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy the candidate report link:", url);
    }
  }

  async function revoke() {
    if (!active) return;
    setBusy(true);
    try {
      await revokeReportLink(jobId, candidateId, active.id);
      setToken(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const active = links.find((l) => l.revokedAt === null);

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
          Share outcome with candidate
        </CardTitle>
        <CardDescription className="text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
          Generate a private link this candidate can open — no account — showing their own scores,
          the quoted evidence behind them, and the anchored scale. They never see other candidates,
          your notes, or any files. You can revoke it at any time; every step is audit-logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <NoticeBanner error={error} /> : null}

        {token ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-warning)" }}>
              Copy your link now — for the candidate's privacy the full URL is shown only this once.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] border px-3 py-2 text-xs"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
              >
                {`${typeof window !== "undefined" ? window.location.origin : ""}/report/${token}`}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copy()}>
                {copied ? "Copied ✓" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revoke()}>
                Revoke
              </Button>
            </div>
          </div>
        ) : active ? (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            style={{ color: "var(--color-fg-muted)" }}
          >
            <span
              className="rounded-full px-2 py-0.5 font-medium"
              style={{
                background: "color-mix(in oklab, var(--color-success) 16%, transparent)",
                color: "var(--color-success)",
              }}
            >
              Active link
            </span>
            <span>created {shortDate(active.createdAt)}</span>
            <span>
              opened {active.readCount} {active.readCount === 1 ? "time" : "times"}
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revoke()}>
              Revoke
            </Button>
          </div>
        ) : null}

        {token ? null : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span style={{ color: "var(--color-fg-muted)" }}>
                Optional note to the candidate (shown on the report)
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. Thank you for your time — this summary reflects how your resume was scored against our rubric."
                className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] placeholder:text-[var(--hl-muted)] focus:border-[var(--hl-accent)] focus:outline-none"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
              />
            </label>
            <div>
              <Button size="sm" disabled={busy} onClick={() => void create()}>
                {busy ? "Generating…" : "Generate candidate link"}
              </Button>
            </div>
          </div>
        )}

        {links.length > 1 ? (
          <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            {links.filter((l) => l.revokedAt !== null).length} earlier link
            {links.filter((l) => l.revokedAt !== null).length === 1 ? "" : "s"} superseded or
            revoked.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
