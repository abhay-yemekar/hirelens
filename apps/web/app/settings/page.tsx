"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { organization, useSession } from "@/lib/auth-client";
import { ApiTokensCard } from "./api-tokens-card";
import { MembersCard } from "./members-card";
import { TrackCard } from "./track-card";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
  memberCount?: number;
}

/**
 * Organization settings: rename the active organization (Better Auth
 * organization.update, owner-only) and manage the team — invite members
 * with roles, promote/demote, remove (Better Auth organization plugin).
 */
export default function SettingsPage() {
  const { data: session } = useSession();
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await organization.list();
        const rows: unknown = Array.isArray(res) ? res : res?.data;
        if (Array.isArray(rows)) {
          const list = rows as OrgRow[];
          const active =
            list.find((o) => o.id === session?.session?.activeOrganizationId) ?? list[0] ?? null;
          setOrg(active);
          setName(active?.name ?? "");
        }
      } catch (err) {
        setError(err);
      }
    })();
  }, [session]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!org || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await organization.update({
        organizationId: org.id,
        data: { name: name.trim() },
      });
      if (res?.error) throw new Error(res.error.message ?? "Could not rename the organization");
      setSaved(true);
      // The header switcher reads the org list — reload so it shows the new name.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">Settings</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--hl-mist)" }}>
            Organization preferences. Jobs, candidates and scores all belong to the organization you
            set in the header.
          </p>
        </header>
        {error ? <NoticeBanner error={error} /> : null}

        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>Organization</CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              The name appears in the header switcher and on shared reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {org ? (
              <form className="flex flex-col gap-3" onSubmit={save}>
                <label className="flex flex-col gap-1 text-sm">
                  <span style={{ color: "var(--hl-mist)" }}>Organization name</span>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSaved(false);
                    }}
                    minLength={2}
                    maxLength={100}
                    required
                    className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                  />
                </label>
                <dl
                  className="flex flex-wrap gap-x-8 gap-y-2 text-xs"
                  style={{ color: "var(--hl-muted)" }}
                >
                  <div>
                    <dt className="font-medium">URL slug</dt>
                    <dd>/{org.slug}</dd>
                  </div>
                  {typeof org.memberCount === "number" && (
                    <div>
                      <dt className="font-medium">Members</dt>
                      <dd>{org.memberCount}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={saving || name.trim() === org.name}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  {saved && (
                    <span className="text-sm" style={{ color: "var(--color-success)" }}>
                      ✓ Renamed — refreshing…
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
                Loading…
              </p>
            )}
          </CardContent>
        </Card>

        <TrackCard />
        <MembersCard />
        <ApiTokensCard />
      </div>
    </AppShell>
  );
}
