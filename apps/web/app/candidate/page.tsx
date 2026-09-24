"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FadeIn,
} from "@hirelens/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/auth-client";

/**
 * Candidate home (signed in) — the real destination for candidate-track
 * users. Composition (v1.2 polish): one hero line, TWO product cards
 * (self-check + report lookup), then quiet utility links — never four
 * equal tiles. The report center remembers reports you opened on THIS
 * device only (localStorage), consistent with our privacy story.
 */

interface SavedReport {
  token: string;
  label: string;
  openedAt: string;
}

const REPORTS_KEY = "hirelens.recent-reports";

function loadSavedReports(): SavedReport[] {
  try {
    const raw = window.localStorage.getItem(REPORTS_KEY);
    const parsed = raw === null ? [] : (JSON.parse(raw) as unknown);
    return Array.isArray(parsed) ? (parsed.slice(0, 8) as SavedReport[]) : [];
  } catch {
    return [];
  }
}

function saveReport(token: string, label: string) {
  try {
    const rest = loadSavedReports().filter((r) => r.token !== token);
    window.localStorage.setItem(
      REPORTS_KEY,
      JSON.stringify([{ token, label, openedAt: new Date().toISOString() }, ...rest].slice(0, 8)),
    );
  } catch {
    // Storage unavailable (private mode) — the link still opens.
  }
}

export default function CandidateHomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/signin");
  }, [isPending, session, router]);

  const [reportUrl, setReportUrl] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    setReports(loadSavedReports());
  }, []);

  function openReport(e: React.FormEvent) {
    e.preventDefault();
    setReportError(null);
    const raw = reportUrl.trim();
    if (!raw) return;
    // Accept either the full URL we generated or the bare token.
    const match = raw.match(/\/report\/([A-Za-z0-9_-]+)/);
    const token = match?.[1] ?? raw;
    if (!/^[A-Za-z0-9_-]{8,}$/.test(token)) {
      setReportError(
        "That doesn't look like a HireLens report link — paste the URL from the message you received.",
      );
      return;
    }
    saveReport(token, `Report opened ${new Date().toLocaleDateString()}`);
    router.push(`/report/${token}`);
  }

  const name = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <FadeIn>
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--hl-accent)" }}
          >
            Your side
          </p>
          <h1
            className="mt-2 text-3xl font-semibold tracking-tight"
            style={{ color: "var(--hl-cream)" }}
          >
            Welcome, {name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
            HireLens never scores you silently: every result comes with the exact evidence behind
            it, and you see your own report before anyone acts on it.
          </p>
        </FadeIn>

        {/* The two things a candidate actually does here — equal weight,
            aligned on one row. */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card
            style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
            className="flex flex-col"
          >
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>Score my resume — free</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                Paste your resume (or upload PDF/DOCX) against any job description. Get the same
                evidence-linked score recruiters see.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Link href="/self-check">
                <Button
                  className="w-full"
                  style={{ background: "var(--hl-accent)", color: "var(--hl-ink)" }}
                >
                  Start my self-check
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card
            style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
            className="flex flex-col"
          >
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>Open a report you received</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                A recruiter screened you and shared a private link. Paste it to see your outcome —
                per-criterion scores and the exact evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <form onSubmit={openReport} className="flex flex-col gap-3">
                <input
                  type="text"
                  value={reportUrl}
                  onChange={(e) => setReportUrl(e.target.value)}
                  placeholder="https://…/report/your-token"
                  aria-label="Report link or token"
                  className="w-full rounded-lg border px-3 py-2.5 text-sm placeholder:text-[var(--hl-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hl-accent-soft)]"
                  style={{
                    borderColor: "var(--hl-border)",
                    background: "var(--hl-input)",
                    color: "var(--hl-cream)",
                  }}
                />
                {reportError ? (
                  <p className="text-xs" style={{ color: "var(--hl-warn)" }} role="alert">
                    {reportError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                >
                  Open my report
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Report center — recent reports, remembered on this device only.
            Nothing is stored server-side; clearing your browser clears it. */}
        {reports.length > 0 ? (
          <Card
            className="mt-4"
            style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
          >
            <CardHeader>
              <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                Your recent reports
              </CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                Remembered on this device only — never on our servers. Clearing your browser data
                clears this list.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {reports.map((r) => (
                <Link
                  key={r.token}
                  href={`/report/${r.token}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[0.05]"
                  style={{ color: "var(--hl-cream)" }}
                >
                  <span className="font-mono text-xs" style={{ color: "var(--hl-mist)" }}>
                    …{r.token.slice(-8)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
                    {r.label} →
                  </span>
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.removeItem(REPORTS_KEY);
                  } catch {
                    // ignore
                  }
                  setReports([]);
                }}
                className="mt-1 self-start text-xs underline"
                style={{ color: "var(--hl-muted)" }}
              >
                Clear this list
              </button>
            </CardContent>
          </Card>
        ) : null}

        {/* Utility row — quiet links, not tiles. */}
        <div
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 text-sm"
          style={{ borderColor: "var(--hl-border)" }}
        >
          <Link
            href="/tracker"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            Application tracker
          </Link>
          <Link
            href="/interview-practice"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            Interview practice
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            How your data is treated
          </Link>
          <Link
            href="/settings"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            Switch sides (Settings)
          </Link>
          <Link
            href="/jobs"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            Peek at the recruiter workspace
          </Link>
          <Link
            href="/"
            className="transition-colors hover:underline"
            style={{ color: "var(--hl-mist)" }}
          >
            ← HireLens site
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
