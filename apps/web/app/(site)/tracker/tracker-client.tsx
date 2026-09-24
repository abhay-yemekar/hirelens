"use client";

import { Button } from "@hirelens/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * Application tracker (v1.3, candidate side) — the Jobscan/Enhancv
 * tracker, done our way: every row lives in localStorage on THIS device
 * only (same privacy stance as the report center), exportable to CSV,
 * and each application can carry its self-check score + match %.
 */

interface Application {
  id: string;
  company: string;
  role: string;
  status: "saved" | "applied" | "interviewing" | "offer" | "closed";
  score: number | null;
  notes: string;
  updatedAt: string;
}

const STORAGE_KEY = "hirelens.applications";

const STATUS_ORDER: Application["status"][] = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "closed",
];

const STATUS_STYLE: Record<Application["status"], { label: string; fg: string; bg: string }> = {
  saved: { label: "Saved", fg: "#b6bdd4", bg: "rgba(148,163,184,0.12)" },
  applied: { label: "Applied", fg: "#7dd3fc", bg: "rgba(56,189,248,0.12)" },
  interviewing: { label: "Interviewing", fg: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  offer: { label: "Offer", fg: "#34d399", bg: "rgba(52,211,153,0.12)" },
  closed: { label: "Closed", fg: "#94a3b8", bg: "rgba(100,116,139,0.12)" },
};

function load(): Application[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is Application =>
          typeof a === "object" && a !== null && typeof (a as Application).id === "string",
      )
      .map((a) => ({ ...a, status: STATUS_ORDER.includes(a.status) ? a.status : "saved" }));
  } catch {
    return [];
  }
}

function save(apps: Application[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  } catch {
    // Storage unavailable (private mode) — the session still works in memory.
  }
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function TrackerClient() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [score, setScore] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setApps(load());
    setMounted(true);
  }, []);

  const sorted = useMemo(() => {
    if (!apps) return [];
    const rank = (s: Application["status"]) => STATUS_ORDER.indexOf(s);
    return [...apps].sort(
      (a, b) => rank(a.status) - rank(b.status) || b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [apps]);

  function add() {
    if (company.trim().length === 0 && role.trim().length === 0) return;
    const parsedScore = /^\d+$/.test(score.trim())
      ? Math.min(100, Math.max(0, Number(score.trim())))
      : null;
    const next: Application[] = [
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        company: company.trim() || "—",
        role: role.trim() || "—",
        status: "saved",
        score: parsedScore,
        notes: "",
        updatedAt: new Date().toISOString(),
      },
      ...(apps ?? []),
    ];
    setApps(next);
    save(next);
    setCompany("");
    setRole("");
    setScore("");
  }

  function update(id: string, patch: Partial<Application>) {
    const next = (apps ?? []).map((a) =>
      a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
    );
    setApps(next);
    save(next);
  }

  function remove(id: string) {
    const next = (apps ?? []).filter((a) => a.id !== id);
    setApps(next);
    save(next);
  }

  function exportCsv() {
    const header = ["Company", "Role", "Status", "Self-check score", "Notes", "Updated"];
    const rows = sorted.map((a) => [
      a.company,
      a.role,
      STATUS_STYLE[a.status].label,
      a.score === null ? "" : String(a.score),
      a.notes.replace(/\r?\n/g, " "),
      a.updatedAt.slice(0, 10),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hirelens-applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => {
    const c = new Map<Application["status"], number>();
    for (const a of apps ?? []) c.set(a.status, (c.get(a.status) ?? 0) + 1);
    return c;
  }, [apps]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hl-warn)]">
          Private by default
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Application tracker</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--hl-mist)]">
          Every application in one list — role, company, status, and your HireLens score. Stored on
          this device only (never on our servers), exportable as CSV.
        </p>
      </header>

      <ul className="flex flex-wrap justify-center gap-2">
        {STATUS_ORDER.map((s) => (
          <li
            key={s}
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              borderColor: "var(--hl-border)",
              color: STATUS_STYLE[s].fg,
              background: counts.get(s) ? STATUS_STYLE[s].bg : "transparent",
            }}
          >
            {STATUS_STYLE[s].label}: {counts.get(s) ?? 0}
          </li>
        ))}
      </ul>

      <div
        className="mt-6 flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-end"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
      >
        <label className="flex-1 text-xs font-medium text-[var(--hl-mist)]">
          Company
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--hl-border)",
              background: "var(--hl-ink-3)",
              color: "var(--hl-cream)",
            }}
          />
        </label>
        <label className="flex-1 text-xs font-medium text-[var(--hl-mist)]">
          Role
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Backend Engineer"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--hl-border)",
              background: "var(--hl-ink-3)",
              color: "var(--hl-cream)",
            }}
          />
        </label>
        <label className="w-full text-xs font-medium text-[var(--hl-mist)] sm:w-28">
          Score
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "var(--hl-border)",
              background: "var(--hl-ink-3)",
              color: "var(--hl-cream)",
            }}
          />
        </label>
        <Button
          onClick={add}
          disabled={company.trim().length === 0 && role.trim().length === 0}
          className="disabled:opacity-40"
        >
          Add
        </Button>
      </div>

      {mounted && sorted.length === 0 && (
        <div className="mt-10 text-center text-sm text-[var(--hl-mist)]">
          Nothing tracked yet — add your first application above, or{" "}
          <Link
            href="/self-check"
            className="underline underline-offset-2"
            style={{ color: "var(--hl-accent)" }}
          >
            score a resume first →
          </Link>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {sorted.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-semibold text-[var(--hl-cream)]">{a.role}</span>
                <span className="text-sm text-[var(--hl-mist)]">· {a.company}</span>
                {a.score !== null && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ background: "var(--hl-accent-soft)", color: "var(--hl-accent)" }}
                  >
                    {a.score}/100
                  </span>
                )}
                <select
                  value={a.status}
                  onChange={(e) =>
                    update(a.id, { status: e.target.value as Application["status"] })
                  }
                  aria-label={`Status for ${a.role} at ${a.company}`}
                  className="ml-auto cursor-pointer rounded-full border px-2 py-1 text-xs font-medium"
                  style={{
                    borderColor: "var(--hl-border)",
                    color: STATUS_STYLE[a.status].fg,
                    background: STATUS_STYLE[a.status].bg,
                  }}
                >
                  {STATUS_ORDER.map((s) => (
                    <option
                      key={s}
                      value={s}
                      style={{ background: "var(--hl-card)", color: "var(--hl-cream)" }}
                    >
                      {STATUS_STYLE[s].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  aria-label={`Remove ${a.role} at ${a.company}`}
                  className="rounded px-1.5 py-1 text-xs transition-colors hover:bg-white/[0.08]"
                  style={{ color: "#f87171" }}
                >
                  ✕
                </button>
              </div>
              <input
                value={a.notes}
                onChange={(e) => update(a.id, { notes: e.target.value })}
                placeholder="Notes — referral name, next step, salary band…"
                className="mt-3 w-full rounded-lg border bg-transparent px-3 py-2 text-xs"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
              />
            </div>
          ))}
          <div className="mt-2 flex justify-center">
            <Button variant="outline" onClick={exportCsv}>
              ↓ Export CSV
            </Button>
          </div>
          <p className="text-center text-xs text-[var(--hl-mist)]">
            Data lives in this browser only. Clearing site data clears the tracker — export first.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-[var(--hl-mist)]">
        Not scoring well enough to apply yet?{" "}
        <Link
          href="/self-check"
          className="underline underline-offset-2"
          style={{ color: "var(--hl-accent)" }}
        >
          Score and strengthen your resume →
        </Link>
      </p>
    </main>
  );
}
