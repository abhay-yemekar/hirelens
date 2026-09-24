"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand";
import { organization, setUserTrack, signOut, userTrack, useSession } from "@/lib/auth-client";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Top bar for authenticated product pages — side-aware by design:
 *  - Logo → the marketing site (the universal "back to the website" move).
 *  - A visible Recruiter ⇄ Candidate toggle: the side indicator IS a
 *    control; switching sides is one click from any page.
 *  - Recruiter chrome (org switcher, Analytics) renders only on the
 *    recruiter side — candidates never see org machinery.
 *  - Sign out lands on the website, not a dead-end sign-in page.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const track = userTrack(session?.user);
  const isRecruiter = track !== "candidate";
  const homeHref = track === "candidate" ? "/candidate" : "/jobs";
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session || !isRecruiter) return;
    (async () => {
      try {
        const res = await organization.list();
        const rows: unknown = Array.isArray(res) ? res : res?.data;
        if (Array.isArray(rows)) {
          const list = rows as OrgRow[];
          setOrgs(list);
          const active = list.find((o) => o.id === session?.session?.activeOrganizationId);
          setActiveId(active?.id ?? list[0]?.id ?? null);
        }
      } catch {
        setOrgs([]);
      }
    })();
  }, [session, isRecruiter]);

  // Close either dropdown on outside click or Escape.
  useEffect(() => {
    if (!switcherOpen && !accountOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setSwitcherOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node))
        setAccountOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSwitcherOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [switcherOpen, accountOpen]);

  async function switchOrg(id: string) {
    setSwitcherOpen(false);
    const res = await organization.setActive({ organizationId: id });
    if (res?.error) return;
    setActiveId(id);
    router.refresh();
    // Data is org-scoped; reload so the page refetches under the new org.
    window.location.reload();
  }

  /** Header side toggle — the side indicator is a control, not a label. */
  async function switchSide(next: "candidate" | "recruiter") {
    if (next === track || switching) return;
    setSwitching(true);
    try {
      await setUserTrack(next);
      router.push(next === "candidate" ? "/candidate" : "/jobs");
      router.refresh();
      // Session data (track) lives in a cached reactor; a clean reload
      // guarantees every surface re-renders under the new side.
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  const active = orgs.find((o) => o.id === activeId) ?? null;
  const displayName = isPending
    ? ""
    : (session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "");
  const initial = displayName.slice(0, 1).toUpperCase() || "?";

  return (
    <div className="hl-app flex min-h-screen flex-col" data-theme="dark">
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl"
        style={{
          borderColor: "var(--hl-border)",
          background: "color-mix(in oklab, var(--hl-ink) 82%, transparent)",
        }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          {/* Logo → marketing site: the standard "back to the website" move. */}
          <Link href="/" className="text-[var(--hl-cream)]" aria-label="HireLens website home">
            <Logo compact />
          </Link>
          <span aria-hidden className="h-5 w-px" style={{ background: "var(--hl-border)" }} />

          {/* Organization switcher — recruiter machinery, recruiter side only. */}
          {isRecruiter && (
            <div className="relative" ref={popRef}>
              <button
                type="button"
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-expanded={switcherOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
                  style={{ background: "var(--hl-accent-soft)", color: "var(--hl-accent)" }}
                >
                  {(active?.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                {active ? active.name : "No organization"}
                <span aria-hidden className="text-[10px] opacity-60">
                  ▾
                </span>
              </button>
              {switcherOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border p-1.5 shadow-xl"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                >
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="menuitem"
                      onClick={() => void switchOrg(o.id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.05]"
                      style={{ color: "var(--hl-cream)" }}
                    >
                      <span>
                        {o.name}
                        <span className="ml-2 text-xs" style={{ color: "var(--hl-muted)" }}>
                          /{o.slug}
                        </span>
                      </span>
                      {o.id === activeId && (
                        <span aria-hidden style={{ color: "var(--hl-accent)" }}>
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 h-px" style={{ background: "var(--hl-border)" }} />
                  <Link
                    href="/welcome"
                    role="menuitem"
                    className="block rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05]"
                    style={{ color: "var(--hl-accent)" }}
                  >
                    + New organization
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Side toggle — the visible side indicator, switchable in one
                click from any page. Selected side fills coral. */}
            <div
              role="tablist"
              aria-label="Which side of HireLens you're using"
              className="flex items-center rounded-full border p-0.5"
              style={{ borderColor: "var(--hl-border)" }}
            >
              {(["recruiter", "candidate"] as const).map((side) => {
                const selected = track === side;
                return (
                  <button
                    key={side}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => void switchSide(side)}
                    disabled={switching}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold capitalize transition-colors disabled:opacity-60 sm:px-3"
                    style={
                      selected
                        ? { background: "var(--hl-accent)", color: "var(--hl-ink)" }
                        : { color: "var(--hl-mist)" }
                    }
                  >
                    {side}
                  </button>
                );
              })}
            </div>

            {/* Analytics — recruiter-only (it's org-wide hiring data). */}
            {isRecruiter && (
              <Link
                href="/analytics"
                className="hidden rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:text-[var(--hl-cream)] sm:inline-block"
                style={{ color: "var(--hl-mist)" }}
                title="Org-wide hiring analytics"
              >
                Analytics
              </Link>
            )}
            <Link
              href="/docs"
              className="hidden rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:text-[var(--hl-cream)] sm:inline-block"
              style={{ color: "var(--hl-mist)" }}
            >
              Docs
            </Link>

            {/* Account chip: identity + grouped menu. Sign out lives here
                (destructive row). */}
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--hl-border)" }}
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: "var(--hl-accent-soft)", color: "var(--hl-accent)" }}
                >
                  {initial}
                </span>
                <span
                  className="hidden max-w-[160px] truncate text-sm sm:inline-block"
                  style={{ color: "var(--hl-cream)" }}
                  title={session?.user?.email ?? ""}
                >
                  {displayName}
                </span>
                <span aria-hidden className="text-[10px] opacity-60">
                  ▾
                </span>
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border p-1.5 shadow-xl"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                >
                  <div className="px-3 py-2">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: "var(--hl-cream)" }}
                    >
                      {displayName}
                    </p>
                    <p className="truncate text-xs" style={{ color: "var(--hl-muted)" }}>
                      {session?.user?.email ?? ""}
                    </p>
                  </div>
                  <div className="my-1 h-px" style={{ background: "var(--hl-border)" }} />
                  <Link
                    href={homeHref}
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[0.05]"
                    style={{ color: "var(--hl-cream)" }}
                  >
                    Your hub
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setAccountOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[0.05]"
                    style={{ color: "var(--hl-cream)" }}
                  >
                    Settings
                  </Link>
                  <div className="my-1 h-px" style={{ background: "var(--hl-border)" }} />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => signOut().then(() => (window.location.href = "/"))}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.05]"
                    style={{ color: "var(--hl-bad)" }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
