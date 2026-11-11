"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@candidlens/ui";
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

interface FullOrg {
  members?: Array<{ userId: string; role: string | string[] }>;
}

function roleOf(m: { role: string | string[] }): string {
  const raw = Array.isArray(m.role) ? m.role[0] : m.role;
  return ((raw ?? "").split(",")[0] ?? "").trim();
}

/**
 * API tokens (Settings → Integrations) — mint machine credentials for ATS
 * webhooks. The raw token is displayed exactly once with a copy button;
 * after that only the …last4 hint remains. The token API is owner-only, so
 * the card asks for the member's role first and calls it only for owners;
 * everyone else sees a short "owners only" note.
 */
export function ApiTokensCard() {
  const { data: session } = useSession();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** The member's role in the active organization; null until known. */
  const [myRole, setMyRole] = useState<string | null>(null);

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

  // Owner check mirrors MembersCard: from the org's member rows.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await organization.getFullOrganization();
        const { data, error: orgError } = res as {
          data?: FullOrg | null;
          error?: { message?: string } | null;
        };
        if (orgError || !data) {
          throw new Error(orgError?.message ?? "Could not check your role in this organization");
        }
        const mine = data.members?.find((m) => m.userId === session.user?.id);
        if (!cancelled) setMyRole(mine ? roleOf(mine) : "");
      } catch (err) {
        if (!cancelled) {
          setError(err);
          setMyRole("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const isOwner = myRole === "owner";

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

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

  const header = (
    <CardHeader>
      <CardTitle style={{ color: "var(--hl-cream)" }}>Integrations — API tokens</CardTitle>
      <CardDescription style={{ color: "var(--hl-mist)" }}>
        Machine credentials for ATS webhooks (Greenhouse, Lever, Zapier, …) and the public parser
        API (`POST /api/public/parse` — stateless resume → structured profile). A token acts as your
        organization — scope it per vendor and revoke instantly.{" "}
        <a href="/docs/ats-integration" className="underline" style={{ color: "var(--hl-accent)" }}>
          Integration guide →
        </a>
      </CardDescription>
    </CardHeader>
  );

  // Until the role is known, and for everyone but owners, the card never
  // calls the owner-only token API.
  if (!isOwner) {
    return (
      <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
        {header}
        <CardContent className="flex flex-col gap-4">
          {myRole === null ? (
            <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
              Loading…
            </p>
          ) : error !== null ? (
            <NoticeBanner error={error} />
          ) : (
            <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
              Only organization owners can create, view and revoke API tokens. If an integration
              needs one, ask an owner of this organization.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      {header}
      <CardContent className="flex flex-col gap-4">
        {error !== null && !loading ? <NoticeBanner error={error} /> : null}

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
            or call the parser at <code>/api/public/parse</code> — see the guide above.
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
                      {t.revokedAt === null ? (
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
