"use client";

import { Button } from "@hirelens/ui";
import { Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { setUserTrack, userTrack, useSession } from "@/lib/auth-client";

/**
 * One-time post-signup chooser: which side of hiring are you on?
 *
 * Shown once per account (recorded on the user record; returning users
 * never see it). Recruiter path continues into workspace setup; candidate
 * path leads to the candidate hub with the free self-check. Choosing
 * candidate also skips nothing permanently — the user can still visit
 * /welcome later; this screen only personalizes the first step.
 */

export default function TrackPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [busy, setBusy] = useState<"recruiter" | "candidate" | null>(null);

  // Already answered, or arriving here as a returning user: skip onward.
  useEffect(() => {
    const track = userTrack(session?.user);
    if (!isPending && track) {
      router.replace(track === "candidate" ? "/for-candidates" : "/jobs");
    }
  }, [isPending, session, router]);

  async function choose(track: "recruiter" | "candidate") {
    setBusy(track);
    try {
      await setUserTrack(track);
    } catch {
      // Non-fatal: the choice also drives routing below; if saving fails we
      // still route and the user can be asked again next signup-session.
    }
    if (track === "candidate") {
      router.push("/for-candidates");
    } else {
      router.push("/welcome");
    }
    router.refresh();
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <main
      className="flex min-h-screen flex-col items-center px-4 py-8"
      style={{ background: "var(--hl-ink)" }}
    >
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <span className="text-[var(--hl-cream)]">
            <Logo />
          </span>
          <Link
            href="/"
            className="text-sm transition-colors hover:text-[var(--hl-cream)]"
            style={{ color: "var(--hl-mist)" }}
          >
            ← Home
          </Link>
        </div>

        <div className="mt-14 text-center">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
          >
            One question — asked once
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--hl-cream)] sm:text-4xl">
            Welcome, {firstName}. Which side of hiring are you on?
          </h1>
          <p
            className="mx-auto mt-3 max-w-xl text-sm leading-6"
            style={{ color: "var(--hl-mist)" }}
          >
            HireLens works for both. Pick your starting point — you can always use the other side
            later.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {/* Recruiter card */}
          <button
            type="button"
            onClick={() => choose("recruiter")}
            disabled={busy !== null}
            className="group rounded-2xl border p-7 text-left transition-transform hover:-translate-y-1 disabled:opacity-60"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-xl border"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
            >
              <Briefcase size={22} style={{ color: "var(--hl-accent)" }} />
            </span>
            <h2 className="mt-5 text-lg font-semibold" style={{ color: "var(--hl-cream)" }}>
              I hire — set up my workspace
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
              Post a job, derive a rubric, and screen candidates with evidence-linked scores, blind
              review, and one-click bias audits.
            </p>
            <span
              className="mt-4 inline-block text-sm font-medium transition-colors"
              style={{ color: "var(--hl-accent)" }}
            >
              {busy === "recruiter" ? "Setting up…" : "Continue →"}
            </span>
          </button>

          {/* Candidate card */}
          <button
            type="button"
            onClick={() => choose("candidate")}
            disabled={busy !== null}
            className="group rounded-2xl border p-7 text-left transition-transform hover:-translate-y-1 disabled:opacity-60"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-xl border"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
            >
              <UserRound size={22} style={{ color: "var(--hl-accent)" }} />
            </span>
            <h2 className="mt-5 text-lg font-semibold" style={{ color: "var(--hl-cream)" }}>
              I'm a candidate — see my side
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
              Score your resume against any job description — free. And if a recruiter uses
              HireLens, you can receive your evidence-backed report as a private link.
            </p>
            <span
              className="mt-4 inline-block text-sm font-medium transition-colors"
              style={{ color: "var(--hl-accent)" }}
            >
              {busy === "candidate" ? "Opening…" : "Explore →"}
            </span>
          </button>
        </div>

        <div className="mt-10 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => choose("recruiter")}
            disabled={busy !== null}
            style={{ color: "var(--hl-muted)" }}
          >
            Skip — take me to my workspace
          </Button>
        </div>
      </div>
    </main>
  );
}
