"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand";

/** One dropdown entry: a page plus the one-line promise it keeps. */
interface MenuItem {
  href: string;
  label: string;
  desc: string;
}

const MENUS: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "Product",
    items: [
      {
        href: "/#features",
        label: "AI screening",
        desc: "Evidence-linked scoring for every resume",
      },
      {
        href: "/#how-it-works",
        label: "How it works",
        desc: "From upload to debrief in four steps",
      },
      {
        href: "/#accuracy",
        label: "Accuracy & bias audit",
        desc: "Anchored rubrics and four-fifths checks",
      },
      {
        href: "/#self-host",
        label: "Self-hosting",
        desc: "Resumes never have to leave your machine",
      },
    ],
  },
  {
    label: "Candidates",
    items: [
      {
        href: "/self-check",
        label: "Score my resume",
        desc: "Free, instant, evidence-backed — no signup",
      },
      {
        href: "/for-candidates",
        label: "Why transparent screening",
        desc: "Your report, your evidence, opt-in demographics",
      },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/docs", label: "Documentation", desc: "Everything from setup to API" },
      { href: "/docs/quickstart", label: "Quickstart", desc: "Screen your first job in minutes" },
      {
        href: "/docs/self-hosting",
        label: "Self-hosting guide",
        desc: "Docker, env vars, and API keys",
      },
      { href: "/docs/cli", label: "CLI", desc: "Drive HireLens from any pipeline" },
      { href: "/docs/api-reference", label: "API reference", desc: "Endpoints, auth, examples" },
      { href: "/troubleshooting", label: "Troubleshooting", desc: "Common issues and fixes" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/contact", label: "Contact", desc: "Questions, bugs, and feedback" },
      { href: "/roadmap", label: "Roadmap", desc: "What shipped and what's next" },
      { href: "/security", label: "Security", desc: "How we protect candidate data" },
      { href: "/contributing", label: "Contributing", desc: "PRs welcome — read the guide" },
    ],
  },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  /** Which dropdown is expanded (desktop); null = none. */
  const [menu, setMenu] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  // Close the dropdown on outside click or Escape — standard disclosure-menu
  // behavior so keyboard and pointer users both get a reliable exit.
  useEffect(() => {
    if (menu === null) return;
    function onPointer(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      style={{
        borderColor: "var(--hl-border)",
        background: "color-mix(in oklab, var(--hl-ink) 78%, transparent)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="text-[var(--hl-cream)]">
          <Logo />
        </Link>

        {/* Desktop mega-menu */}
        <nav
          className="ml-auto hidden items-center gap-1 text-sm md:flex"
          aria-label="Main"
          style={{ color: "var(--hl-mist)" }}
        >
          {MENUS.map((m) => {
            const expanded = menu === m.label;
            return (
              <div key={m.label} className="relative">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-haspopup="true"
                  onMouseEnter={() => setMenu(m.label)}
                  onClick={() => setMenu(expanded ? null : m.label)}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 transition-colors hover:text-[var(--hl-cream)]"
                >
                  {m.label}
                  <svg
                    aria-hidden
                    viewBox="0 0 12 12"
                    className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                  >
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {expanded && (
                  <div
                    className="absolute left-1/2 top-full z-50 w-80 -translate-x-1/2 pt-2"
                    role="menu"
                    onMouseLeave={() => setMenu((cur) => (cur === m.label ? null : cur))}
                  >
                    <div
                      className="overflow-hidden rounded-xl border shadow-2xl"
                      style={{
                        borderColor: "var(--hl-border)",
                        background: "var(--hl-ink-3)",
                      }}
                    >
                      <ul className="flex flex-col p-2">
                        {m.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              role="menuitem"
                              onClick={() => setMenu(null)}
                              className="block rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.05]"
                            >
                              <span className="block text-sm font-medium text-[var(--hl-cream)]">
                                {item.label}
                              </span>
                              <span className="block text-xs text-[var(--hl-muted)]">
                                {item.desc}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className={`flex items-center gap-2 ${menu === null ? "ml-auto" : "ml-auto"} md:ml-0 md:gap-3`}
        >
          <Link
            href="/signin"
            className="rounded-lg border px-3 py-2 text-sm font-semibold text-[var(--hl-cream)] transition-colors hover:border-[var(--hl-mist)]"
            style={{ borderColor: "var(--hl-border)" }}
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-[var(--hl-cream)] transition-colors md:inline-block"
            style={{ background: "var(--hl-accent)" }}
          >
            Try the demo
          </Link>
          <Link
            href="https://github.com/abhay-yemekar/hirelens"
            className="hidden rounded-lg border px-4 py-2 text-sm font-semibold text-[var(--hl-cream)] transition-colors hover:border-[var(--hl-mist)] md:inline-block"
            style={{ borderColor: "var(--hl-border)" }}
          >
            GitHub
          </Link>
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border text-[var(--hl-cream)] md:hidden"
            style={{ borderColor: "var(--hl-border)" }}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile: grouped lists mirroring the desktop menus */}
      {open && (
        <nav
          className="max-h-[70vh] overflow-y-auto border-t px-4 py-3 md:hidden"
          style={{ borderColor: "var(--hl-border)" }}
          aria-label="Mobile"
        >
          {MENUS.map((m) => (
            <div key={m.label} className="mb-3">
              <p
                className="px-1 pb-1 text-[0.7rem] font-semibold tracking-wider uppercase"
                style={{ color: "var(--hl-muted)" }}
              >
                {m.label}
              </p>
              <ul className="flex flex-col text-sm" style={{ color: "var(--hl-mist)" }}>
                {m.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setOpen(false)} className="py-1.5">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Link
            href="/demo"
            onClick={() => setOpen(false)}
            className="font-semibold text-[var(--hl-cream)]"
          >
            Try the demo →
          </Link>
        </nav>
      )}
    </header>
  );
}
