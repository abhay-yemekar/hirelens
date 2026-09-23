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
import { userTrack, useSession } from "@/lib/auth-client";

/**
 * Candidate home (signed in) — the real destination for candidate-track
 * users. Honest about what a signed-in candidate can do: run the free
 * self-check, open a report a recruiter shared (token link), and switch
 * sides. No fake data, no empty dashboard shell.
 */
export default function CandidateHomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/signin");
  }, [isPending, session, router]);

  const [reportUrl, setReportUrl] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);

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
            You're on the candidate side. HireLens never scores you silently: every result comes
            with the exact evidence behind it, and you see your own report before anyone acts on it.
          </p>
        </FadeIn>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card
            style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
            className="transition-transform duration-[var(--duration-fast)] hover:-translate-y-0.5"
          >
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>Score my resume — free</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                Paste your resume (or upload PDF/DOCX) against any job description. Get the same
                evidence-linked score recruiters see — free, no strings.
              </CardDescription>
            </CardHeader>
            <CardContent>
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

          <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>Open a report you received</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                When a recruiter screens you with HireLens, they share a private link. Paste it here
                to open your outcome — per-criterion scores and the exact evidence quotes.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                  <p className="text-xs" style={{ color: "var(--color-warning)" }} role="alert">
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

          <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>How your data is treated</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                Self-checks are processed and never stored against your account. Demographics in
                bias self-reports are always opt-in, every field skippable, and used only to detect
                discrimination in aggregate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/privacy"
                className="text-sm font-medium transition-colors hover:underline"
                style={{ color: "var(--hl-accent)" }}
              >
                Read the privacy policy →
              </Link>
            </CardContent>
          </Card>

          <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>On the hiring side too?</CardTitle>
              <CardDescription style={{ color: "var(--hl-mist)" }}>
                Many of our users both hire and apply. Switch sides any time — your account carries
                over, nothing is lost.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link href="/settings">
                <Button
                  variant="outline"
                  style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                >
                  Change my side in Settings
                </Button>
              </Link>
              <Link href="/jobs">
                <Button variant="ghost" style={{ color: "var(--hl-mist)" }}>
                  Peek at the recruiter workspace
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
