"use client";

import { Button } from "@hirelens/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Logo } from "@/components/brand";
import { NoticeBanner } from "@/components/notice-banner";
import { organization, useSession } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
}

const STEPS = [
  {
    title: "Create your organization",
    text: "A workspace for your hiring team — jobs, candidates, and scoring runs live inside it.",
  },
  {
    title: "Post a job",
    text: "Describe the role in plain language; HireLens drafts a scoring rubric from it.",
  },
  {
    title: "Upload resumes & score",
    text: "Drop in resumes, run scoring, and review evidence-linked rankings with a built-in bias audit.",
  },
];

/** Slugify an org name: lowercase, ASCII-safe, hyphen-separated. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Workspace setup: create an organization (becomes the active tenant) or
 * activate one you already belong to. Jobs, candidates, and scoring runs
 * are scoped to the active organization.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);

  useEffect(() => {
    if (!session) return;
    organization
      .list()
      .then((res) => {
        // Client actions resolve to { data, error } (older shapes: raw array).
        const rows: unknown = Array.isArray(res) ? res : res?.data;
        if (Array.isArray(rows)) setOrgs(rows as OrgRow[]);
      })
      .catch(() => setOrgs([]));
  }, [session]);

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
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setError(null);
    const res = await organization.setActive({ organizationId: id });
    if (res?.error) {
      setError(res.error.message ?? "Could not activate organization");
      return;
    }
    router.push("/jobs");
    router.refresh();
  }

  if (!isPending && !session) {
    router.replace("/signin");
    return null;
  }

  const inputClass =
    "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-[var(--hl-cream)] transition-shadow focus:outline-none focus:border-[var(--hl-accent)] focus:ring-2 focus:ring-[var(--hl-accent-soft)] placeholder:text-[var(--hl-muted)]";
  const inputStyle = { borderColor: "var(--hl-border)", background: "var(--hl-input)" } as const;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
            Set up your workspace
          </h1>
          <p className="mt-1 text-sm text-[var(--hl-mist)]">
            One quick step and you're in — pick a workspace below, or create a new one.
          </p>
        </header>

        {/* The 3-step path, compact. */}
        <ol className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="hl-card flex flex-1 gap-3 p-4"
              aria-label={`Step ${i + 1}: ${s.title}`}
            >
              <span
                aria-hidden
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--hl-accent-soft)", color: "var(--hl-accent)" }}
              >
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-[var(--hl-cream)]">
                  {s.title}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--hl-mist)]">
                  {s.text}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {error && <NoticeBanner error={error} />}

        {orgs.length > 0 && (
          <section aria-label="Your organizations" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-[var(--hl-cream)]">Your workspaces</h2>
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => void activate(o.id)}
                className="hl-card flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
              >
                <span>
                  <span className="block text-sm font-semibold text-[var(--hl-cream)]">
                    {o.name}
                  </span>
                  <span className="block text-xs text-[var(--hl-muted)]">
                    /{o.slug}
                    {o.createdAt ? ` · created ${timeAgo(o.createdAt)}` : ""}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-lg transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--hl-accent)" }}
                >
                  →
                </span>
              </button>
            ))}
          </section>
        )}

        <form
          onSubmit={createOrg}
          className="hl-card flex flex-col gap-4 p-5"
          style={{ boxShadow: "0 24px 60px -32px rgba(3, 6, 18, 0.85)" }}
        >
          <div className="flex items-center gap-2.5">
            <Logo compact />
            <span aria-hidden className="h-4 w-px" style={{ background: "var(--hl-border)" }} />
            <p className="text-sm font-semibold text-[var(--hl-cream)]">
              {orgs.length > 0 ? "Or create a new organization" : "Create your organization"}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span style={{ color: "var(--hl-mist)" }}>Organization name</span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              placeholder="Acme Talent"
              autoComplete="organization"
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span style={{ color: "var(--hl-mist)" }}>
              Slug <span style={{ color: "var(--hl-muted)" }}>(URL-safe, auto-filled)</span>
            </span>
            <input
              required
              pattern="[a-z0-9-]{3,}"
              title="Lowercase letters, numbers, hyphens; at least 3 characters"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="acme-talent"
              className={inputClass}
              style={inputStyle}
            />
          </label>
          <Button
            type="submit"
            disabled={busy}
            size="lg"
            className="self-start bg-white font-semibold text-[#0d1226] hover:bg-[#eef0fa]"
          >
            {busy ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
