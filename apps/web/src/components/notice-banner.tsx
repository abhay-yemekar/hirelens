"use client";

import Link from "next/link";
import { describeError, type ErrorDescriptor } from "@/lib/errors";

const TONE: Record<
  ErrorDescriptor["tone"],
  { bg: string; fg: string; border: string; role: string }
> = {
  error: {
    bg: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
    fg: "var(--color-danger)",
    border: "color-mix(in oklab, var(--color-danger) 35%, transparent)",
    role: "alert",
  },
  warning: {
    bg: "color-mix(in oklab, var(--color-warning) 14%, transparent)",
    fg: "var(--color-warning)",
    border: "color-mix(in oklab, var(--color-warning) 40%, transparent)",
    role: "status",
  },
  info: {
    bg: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
    fg: "var(--color-accent)",
    border: "color-mix(in oklab, var(--color-accent) 30%, transparent)",
    role: "status",
  },
};

/**
 * Human-facing error/setup banner. Feed it any thrown value; raw API
 * codes never render.
 */
export function NoticeBanner({ error }: { error: unknown }) {
  const d = describeError(error);
  const t = TONE[d.tone];
  return (
    <div
      role={t.role}
      className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      style={{ background: t.bg, borderColor: t.border, color: t.fg }}
    >
      <p className="max-w-prose">{d.text}</p>
      {d.cta && (
        <Link
          href={d.cta.href}
          className="flex-none font-semibold underline underline-offset-4 hover:opacity-85"
        >
          {d.cta.label} →
        </Link>
      )}
    </div>
  );
}
