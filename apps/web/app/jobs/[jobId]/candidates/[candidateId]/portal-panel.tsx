"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { createPortalLink, revokePortalLink } from "@/lib/api";

/**
 * Candidate portal (Wave 4): generates a one-shot, token-gated link the
 * candidate can open (no account) to submit an opt-in demographics
 * self-report. The token is shown exactly once — the DB is the only place
 * it lives afterwards — mirroring the share-link UX.
 */
export function PortalPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [revoked, setRevoked] = useState(false);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    setRevoked(false);
    try {
      const res = await createPortalLink(jobId, candidateId);
      setToken(res.link.token);
      setLinkId(res.link.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [jobId, candidateId]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (!token) return;
    const url = `${window.location.origin}/portal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; fall back to a prompt so the recruiter
      // still gets the URL.
      window.prompt("Copy the portal link:", url);
    }
  }

  async function revoke() {
    if (!linkId) return;
    setBusy(true);
    try {
      await revokePortalLink(jobId, linkId);
      setRevoked(true);
      setToken(null);
      setLinkId(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
          Demographics self-report
        </CardTitle>
        <CardDescription className="text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
          Send this candidate a private link where they can optionally self-report demographics for
          the bias audit. They need no account; the link works once, and you never see the answers
          tied to a shared report.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <NoticeBanner error={error} /> : null}

        {token ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-warning)" }}>
              Copy this link now — it is shown only once.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono text-xs"
                style={{ background: "var(--hl-ink-3)", color: "var(--hl-mist)" }}
              >
                {typeof window !== "undefined" ? `${window.location.origin}/portal/` : ""}
                {token.slice(0, 10)}…
              </code>
              <Button size="sm" variant="outline" onClick={copy} type="button">
                {copied ? "Copied ✓" : "Copy link"}
              </Button>
              <Button size="sm" variant="ghost" onClick={revoke} disabled={busy} type="button">
                Revoke
              </Button>
            </div>
            <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              The link expires after the candidate submits or you revoke it.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={create} disabled={busy} type="button">
              {busy ? "Working…" : "Generate portal link"}
            </Button>
            {revoked ? (
              <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                Previous link revoked.
              </span>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
