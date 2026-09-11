"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { organization, useSession } from "@/lib/auth-client";

/**
 * Org onboarding: after sign-up, the user creates an organization
 * (which becomes their active tenant) or switches to an existing one.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await organization.create({ name: name.trim(), slug: slug.trim() });
      if (res?.error) throw new Error(res.error.message ?? "Could not create organization");
      router.push("/jobs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!isPending && !session) {
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            Jobs, candidates, and scoring runs are scoped to an organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createOrg} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--color-fg-muted)" }}>Organization name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Talent"
                className="rounded-[var(--radius-control)] border px-3 py-2"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  background: "var(--color-surface-raised)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--color-fg-muted)" }}>Slug (URL-safe)</span>
              <input
                required
                pattern="[a-z0-9-]{3,}"
                title="Lowercase letters, numbers, hyphens; at least 3 characters"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="acme-talent"
                className="rounded-[var(--radius-control)] border px-3 py-2"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  background: "var(--color-surface-raised)",
                }}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
