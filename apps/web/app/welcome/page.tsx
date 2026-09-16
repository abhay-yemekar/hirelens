"use client";

import { Button } from "@hirelens/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand";
import { NoticeBanner } from "@/components/notice-banner";
import { organization, useSession } from "@/lib/auth-client";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

const STEPS = [
  {
    title: "Create your organization",
    text: "Jobs, candidates, and scoring runs are scoped to one — like a workspace for your hiring team.",
  },
  {
    title: "Post a job",
    text: "Describe the role in plain language; HireLens derives a scoring rubric from it.",
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
 * Org onboarding: create an organization (becomes the active tenant)
 * or activate one you already belong to. Jobs, candidates, and scoring
 * runs are scoped to the active organization.
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
    "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-[var(--hl-cream)] transition-shadow focus:outline-none focus:border-[var(--hl-accent)] focus:ring-2 focus:ring-[var(--hl-accent-soft)]";
  const inputStyle = { borderColor: "var(--hl-border)", background: "var(--hl-ink-3)" } as const;

  return (
    <main className="relative flex min-h-screen">
      {/* Brand panel */}
      <section
        className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "var(--hl-ink-2)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 420px at 20% 0%, rgba(255,107,87,0.14), transparent 65%), radial-gradient(520px 360px at 85% 100%, rgba(120,140,255,0.08), transparent 60%)",
          }}
        />
        <Link className="relative text-[var(--hl-cream)]" href="/">
          <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight">
            <LogoMark size={26} />
            Hire<span style={{ color: "var(--hl-accent)" }}>Lens</span>
          </span>
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[var(--hl-cream)]">
            Set up your <span style={{ color: "var(--hl-accent)" }}>workspace.</span>
          </h1>
          <ol className="mt-10 flex flex-col gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full border text-sm font-semibold"
                  style={{
                    borderColor: "var(--hl-border)",
                    background: "var(--hl-card)",
                    color: "var(--hl-accent)",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--hl-cream)]">{s.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-[var(--hl-mist)]">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-[var(--hl-muted)]">
          Open source · MIT · self-hostable — resumes never have to leave your machine.
        </p>
      </section>

      {/* Form panel */}
      <section className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(500px 280px at 50% -10%, rgba(255,107,87,0.10), transparent 70%)",
          }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <span className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--hl-cream)]">
              <LogoMark size={24} />
              Hire<span style={{ color: "var(--hl-accent)" }}>Lens</span>
            </span>
          </div>

          <h2 className="text-xl font-semibold text-[var(--hl-cream)]">
            {orgs.length > 0 ? "Continue or create" : "Create your first organization"}
          </h2>
          <p className="mt-1 text-sm text-[var(--hl-mist)]">
            {orgs.length > 0
              ? "Pick a workspace you belong to, or start a new one."
              : "One quick step and you're in."}
          </p>

          {error && (
            <div className="mt-4">
              <NoticeBanner error={error} />
            </div>
          )}

          {orgs.length > 0 && (
            <div className="mt-5 flex flex-col gap-2">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void activate(o.id)}
                  className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                >
                  <span>
                    <span className="block text-sm font-semibold text-[var(--hl-cream)]">
                      {o.name}
                    </span>
                    <span className="block text-xs text-[var(--hl-muted)]">/{o.slug}</span>
                  </span>
                  <span aria-hidden style={{ color: "var(--hl-accent)" }}>
                    →
                  </span>
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={createOrg}
            className="mt-6 flex flex-col gap-4 rounded-2xl border p-5"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <p className="text-sm font-semibold text-[var(--hl-cream)]">
              {orgs.length > 0 ? "Or create a new organization" : "Organization details"}
            </p>
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
              className="h-11 bg-white font-semibold text-[#0d1226] hover:bg-[#eef0fa]"
            >
              {busy ? "Creating…" : "Create organization"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
