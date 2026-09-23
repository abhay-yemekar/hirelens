"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { apiFetch } from "@/lib/api";
import { organization, useSession } from "@/lib/auth-client";

interface TokenRow {
  id: string;
  label: string;
  last4: string;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function shortDate(iso: string | null): string {
  if (iso === null) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/**
 * API tokens (Settings → Integrations) — mint machine credentials for ATS
 * webhooks. The raw token is displayed exactly once with a copy button;
 * after that only the …last4 hint remains. Owner-only server-side.
 */
interface FullOrg {
  members?: Array<{ userId: string; role: string | string[] }>;
}

function roleOf(m: { role: string | string[] }): string {
  const raw = Array.isArray(m.role) ? m.role[0] : m.role;
  return ((raw ?? "").split(",")[0] ?? "").trim();
}

export function ApiTokensCard() {
  const { data: session } = useSession();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [myRole, setMyRole] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok: true; tokens: TokenRow[] }>("/api/tokens");
      setTokens(res.tokens);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Owner check mirrors MembersCard: from the org's member rows.
  useEffect(() => {
    if (!session) return;
    void organization
      .getFullOrganization()
      .then((res) => {
        const data = (res as { data?: FullOrg | null }).data;
        const me = session.user?.id;
        const mine = data?.members?.find((m) => m.userId === me);
        setMyRole(mine ? roleOf(mine) : "");
      })
      .catch(() => undefined);
  }, [session]);

  const isOwner = myRole === "owner";

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    if (label.trim().length === 0) return;
    try {
      const res = await apiFetch<{ ok: true; token: { raw: string } }>("/api/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      setMinted(res.token.raw);
      setLabel("");
      setCopied(false);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/api/tokens/${id}`, { method: "DELETE" });
      setMinted(null);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Integrations — API tokens</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Machine credentials for ATS webhooks (Greenhouse, Lever, Zapier, …). A token acts as your
          organization — scope it per vendor and revoke instantly.{" "}
          <a
            href="/docs/ats-integration"
            className="underline"
            style={{ color: "var(--hl-accent)" }}
          >
            Integration guide →
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error !== null && !loading ? <NoticeBanner error={error} /> : null}

        {isOwner ? (
          <form onSubmit={createToken} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label, e.g. “Greenhouse webhook”"
              aria-label="Token label"
              maxLength={80}
              className="min-w-[220px] flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-[var(--hl-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hl-accent-soft)]"
              style={{
                borderColor: "var(--hl-border)",
                background: "var(--hl-input)",
                color: "var(--hl-cream)",
              }}
            />
            <Button
              type="submit"
              style={{ background: "var(--hl-accent)", color: "var(--hl-ink)" }}
              disabled={label.trim().length === 0}
            >
              Create token
            </Button>
          </form>
        ) : (
          <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
            Only organization owners can manage API tokens.
          </p>
        )}

        {minted !== null ? (
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--hl-accent)", background: "var(--hl-input)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--hl-cream)" }}>
              Copy this token now — it is shown only once.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code
                className="block max-w-full overflow-x-auto rounded px-3 py-2 text-xs"
                style={{ background: "var(--hl-ink)", color: "var(--hl-accent)" }}
              >
                {minted}
              </code>
              <Button
                variant="outline"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                onClick={() => {
                  void navigator.clipboard.writeText(minted).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
            Loading…
          </p>
        ) : tokens.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
            No tokens yet. Create one, then point your ATS webhook at <code>/api/webhooks/ats</code>{" "}
            — see the guide above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--hl-mist)" }}>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Token</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Last used</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t"
                    style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                  >
                    <td className="px-3 py-2">{t.label}</td>
                    <td className="px-3 py-2 font-mono text-xs">…{t.last4}</td>
                    <td className="px-3 py-2">{shortDate(t.createdAt)}</td>
                    <td className="px-3 py-2">{shortDate(t.lastUsedAt)}</td>
                    <td className="px-3 py-2">
                      {t.revokedAt === null ? (
                        <span style={{ color: "var(--color-success, #4ade80)" }}>Active</span>
                      ) : (
                        <span style={{ color: "var(--hl-mist)" }}>Revoked</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.revokedAt === null && isOwner ? (
                        <Button
                          variant="ghost"
                          onClick={() => void revoke(t.id)}
                          style={{ color: "var(--color-danger, #f87171)" }}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
