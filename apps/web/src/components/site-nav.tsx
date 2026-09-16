"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#accuracy", label: "Accuracy" },
  { href: "/#self-host", label: "Self-host" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      style={{
        borderColor: "var(--hl-border)",
        background: "color-mix(in oklab, var(--hl-ink) 78%, transparent)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-8 px-4">
        <Link href="/" className="text-[var(--hl-cream)]">
          <Logo />
        </Link>
        <nav
          className="ml-auto hidden items-center gap-7 text-sm md:flex"
          style={{ color: "var(--hl-mist)" }}
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-[var(--hl-cream)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <Link
            href="/signin"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:text-[var(--hl-cream)] md:inline-block"
            style={{ color: "var(--hl-mist)" }}
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
      {open && (
        <nav className="border-t px-4 py-3 md:hidden" style={{ borderColor: "var(--hl-border)" }}>
          <ul className="flex flex-col gap-3 text-sm" style={{ color: "var(--hl-mist)" }}>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/signin" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            </li>
            <li>
              <Link
                href="/demo"
                onClick={() => setOpen(false)}
                className="font-semibold text-[var(--hl-cream)]"
              >
                Try the demo →
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
