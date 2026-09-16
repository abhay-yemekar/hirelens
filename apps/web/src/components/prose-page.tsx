import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for prose-heavy site pages (legal, docs, community).
 * Keeps the premium dark canvas with a readable measure and a
 * consistent header. Not a route — a layout primitive.
 */
export function ProsePage({
  eyebrow,
  title,
  lede,
  children,
  updated,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children: ReactNode;
  /** Small line under the header, e.g. "Last updated: …". */
  updated?: string;
}) {
  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(700px 300px at 50% -10%, rgba(255,107,87,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-24 pt-16">
        <header>
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--hl-accent)" }}
          >
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {lede && (
            <p className="mt-4 text-base leading-7" style={{ color: "var(--hl-mist)" }}>
              {lede}
            </p>
          )}
          {updated && (
            <p className="mt-3 text-xs" style={{ color: "var(--hl-muted)" }}>
              {updated}
            </p>
          )}
        </header>
        <div className="hl-prose mt-12">{children}</div>
      </div>
    </main>
  );
}

export function BackToHome() {
  return (
    <p className="mt-16 text-sm">
      <Link
        href="/"
        className="transition-colors hover:text-[var(--hl-cream)]"
        style={{ color: "var(--hl-mist)" }}
      >
        ← Back to home
      </Link>
    </p>
  );
}
