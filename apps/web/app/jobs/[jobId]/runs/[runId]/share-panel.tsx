"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { createShareLink, listShareLinks, revokeShareLink, type ShareLinkRow } from "@/lib/api";

/** "2026-09-20T…" → "Sep 20". */
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Public report sharing for this job. The token is the credential: the
 * full URL is returned exactly once at creation (it is never listed
 * again), so the panel keeps the freshly created link until the page
 * reloads and always offers copy-then-share.
 */
export function SharePanel({ jobId }: { jobId: string }) {
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const res = await listShareLinks(jobId);
      setLinks(res.links);
    } catch {
      // Listing is best-effort; creation still works.
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await createShareLink(jobId, {});
      setFreshUrl(`${window.location.origin}/share/${res.link.token}`);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(linkId: string) {
    if (!window.confirm("Revoke this public link? Anyone holding it immediately loses access."))
      return;
    setError(null);
    try {
      await revokeShareLink(jobId, linkId);
      if (freshUrl && !links.some((l) => l.id === linkId)) setFreshUrl(null);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function copyFresh() {
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the URL stays visible to select manually.
    }
  }

  const active = links.filter((l) => !l.revokedAt);

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
            Share report
          </CardTitle>
          <CardDescription style={{ color: "var(--color-fg-muted)" }}>
            A public, read-only link to the latest completed scores. Contact details, resumes and
            demographics are never included — anyone with the link can view it until you revoke.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => void create()} disabled={busy}>
          {busy ? "Creating…" : "Create public link"}
        </Button>
      </CardHeader>
      {error ? (
        <CardContent className="pt-0">
          <NoticeBanner error={error} />
        </CardContent>
      ) : null}
      {freshUrl ? (
        <CardContent
          className="flex flex-col gap-2 border-t pt-4"
          style={{ borderColor: "var(--hl-border)" }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--color-warning)" }}>
            Copy your link now — for security the full URL is shown only this once.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] border px-3 py-2 font-mono text-xs"
              style={{
                borderColor: "var(--hl-border)",
                background: "var(--hl-ink-2)",
                color: "var(--hl-mist)",
              }}
            >
              {freshUrl}
            </code>
            <Button size="sm" variant="outline" onClick={() => void copyFresh()}>
              {copied ? "✓ Copied" : "Copy"}
            </Button>
          </div>
        </CardContent>
      ) : null}
      {links.length > 0 ? (
        <CardContent
          className="flex flex-col gap-2 border-t pt-4"
          style={{ borderColor: "var(--hl-border)" }}
        >
          {links.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={
                  l.revokedAt
                    ? { background: "var(--hl-ink-3)", color: "var(--color-fg-muted)" }
                    : {
                        background: "color-mix(in oklab, var(--color-success) 15%, transparent)",
                        color: "var(--color-success)",
                      }
                }
              >
                {l.revokedAt ? "Revoked" : "Active"}
              </span>
              <span style={{ color: "var(--hl-mist)" }}>
                {shortDate(l.createdAt)}
                {typeof l.readCount === "number" && l.readCount > 0 && (
                  <span className="ml-2 text-xs" style={{ color: "var(--color-fg-muted)" }}>
                    · {l.readCount} view{l.readCount === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              {!l.revokedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void revoke(l.id)}
                  className="text-xs"
                  style={{ color: "var(--color-danger)" }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
          {active.length > 0 && (
            <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              The public page always shows the newest completed scoring run for this job.
            </p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
