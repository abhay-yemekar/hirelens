"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand";
import { NoticeBanner } from "@/components/notice-banner";

/**
 * Public candidate report (v1.1) — the candidate-side surface.
 *
 * The candidate opens this link (no account; the token is the credential)
 * and sees their own screening outcome: overall band, per-criterion scores
 * with the exact quoted evidence, and the anchored scale. Deliberately
 * minimal and honest: no other candidates, no contact info, no files, and
 * a plain-language explanation of what the numbers mean. Data is fetched
 * client-side against the public token endpoint (same-origin API).
 */

interface ReportCriterion {
  key: string;
  title: string;
  weight: number;
  score: number | null;
  confidence: number | null;
  rationale: string | null;
  overridden: boolean;
  evidence: string[];
  scale: Array<{ label: string; description: string }>;
}

interface ReportPayload {
  jobTitle: string;
  rubricTitle: string;
  rubricVersion: number;
  modelId: string;
  finishedAt: string | null;
  overall: number | null;
  band: string | null;
  message: string | null;
  criteria: ReportCriterion[];
  /** Skill-graph buckets (v1.2) — present when the resume was skill-parsed. */
  skills?: { matched: string[]; adjacent: string[]; missing: string[] };
  /** Plain-language improvement steps, weakest area first. */
  improve?: string[];
}

function bandColor(band: string | null): string {
  switch (band) {
    case "Strong match":
      return "var(--color-success)";
    case "Good match":
      return "var(--color-success)";
    case "Partial match":
      return "var(--color-warning)";
    default:
      return "var(--color-warning)";
  }
}

export default function CandidateReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "revoked" | "missing" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/report/${token}`);
        if (cancelled) return;
        if (res.status === 404) {
          setState("missing");
          return;
        }
        if (res.status === 410) {
          setState("revoked");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const body = (await res.json()) as { ok: boolean; report: ReportPayload };
        setReport(body.report);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--hl-ink)", color: "var(--hl-cream)" }}
    >
      <header
        className="border-b px-4 py-4"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <LogoMark />
          <span className="text-sm font-semibold">HireLens</span>
          <span className="ml-auto text-xs" style={{ color: "var(--hl-muted)" }}>
            Evidence-linked screening
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {state === "loading" ? (
          <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
            Loading your report…
          </p>
        ) : null}

        {state === "missing" ? (
          <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>Report not found</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
                This link doesn't exist. Check the URL — or ask the hiring team to resend it.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {state === "revoked" ? (
          <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--hl-cream)" }}>
                This link is no longer active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
                The hiring team has closed access to this report. If you still need your outcome,
                contact them directly and they can issue a fresh link.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {state === "error" ? (
          <NoticeBanner error="Couldn't load your report — please try again." />
        ) : null}

        {state === "ready" && report ? (
          <div className="flex flex-col gap-6">
            {/* What this is — before any numbers. */}
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
            >
              <p
                className="text-xs font-semibold tracking-wider uppercase"
                style={{ color: "var(--hl-accent)" }}
              >
                Your screening outcome
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{report.jobTitle}</h1>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
                An AI model scored your resume against a rubric the hiring team defined in advance —
                a fixed list of criteria, each on an anchored 0–5 scale. Below is every criterion,
                your score, and the exact lines of your resume the model relied on. The hiring team
                makes all decisions; the score never decides anything by itself.
              </p>
              {report.message ? (
                <div
                  className="mt-4 rounded-xl border px-4 py-3 text-sm leading-6"
                  style={{
                    borderColor: "var(--hl-border)",
                    background: "var(--hl-ink-3)",
                    color: "var(--hl-cream)",
                  }}
                >
                  <span className="font-semibold">Note from the hiring team: </span>
                  {report.message}
                </div>
              ) : null}
            </div>

            {/* Overall band */}
            {report.overall !== null ? (
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="rounded-2xl border px-6 py-4"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                >
                  <p
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "var(--hl-muted)" }}
                  >
                    Overall
                  </p>
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: "var(--hl-cream)" }}
                  >
                    {Math.round(report.overall)}
                    <span className="text-base font-normal" style={{ color: "var(--hl-muted)" }}>
                      {" "}
                      / 100
                    </span>
                  </p>
                </div>
                <div
                  className="rounded-full px-4 py-1.5 text-sm font-semibold"
                  style={{
                    background: "color-mix(in oklab, var(--hl-card) 70%, transparent)",
                    color: bandColor(report.band),
                    border: "1px solid var(--hl-border)",
                  }}
                >
                  {report.band}
                </div>
              </div>
            ) : null}

            {/* Per-criterion cards with evidence */}
            <div className="flex flex-col gap-4">
              {report.criteria.map((crit) => (
                <Card
                  key={crit.key}
                  style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                        {crit.title}
                      </CardTitle>
                      <span
                        className="rounded-full px-3 py-1 text-sm font-bold tabular-nums"
                        style={{
                          background: "var(--hl-ink-3)",
                          color: "var(--hl-accent)",
                          border: "1px solid var(--hl-border)",
                        }}
                      >
                        {crit.score === null ? "not scored" : `${crit.score} / 5`}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    {crit.rationale ? (
                      <p className="leading-6" style={{ color: "var(--hl-mist)" }}>
                        {crit.rationale}
                      </p>
                    ) : null}

                    {crit.evidence.length > 0 ? (
                      <div>
                        <p
                          className="text-xs font-semibold tracking-wider uppercase"
                          style={{ color: "var(--hl-muted)" }}
                        >
                          The lines behind this score
                        </p>
                        <ul className="mt-1 flex flex-col gap-1.5">
                          {crit.evidence.map((quote, i) => (
                            <li
                              key={`${crit.key}-${i}`}
                              className="rounded-lg border-l-2 px-3 py-2 font-mono text-xs leading-5"
                              style={{
                                borderColor: "var(--hl-accent)",
                                background: "var(--hl-ink-3)",
                                color: "var(--hl-cream)",
                              }}
                            >
                              &ldquo;{quote}&rdquo;
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
                        No specific lines were cited for this criterion.
                      </p>
                    )}

                    {/* Anchored scale — where this score sits */}
                    <details>
                      <summary
                        className="cursor-pointer text-xs font-medium"
                        style={{ color: "var(--hl-accent)" }}
                      >
                        What the 0–5 scale means for &ldquo;{crit.title}&rdquo;
                      </summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {crit.scale.map((lvl, idx) => {
                          const awarded = crit.score !== null && Math.round(crit.score) === idx;
                          return (
                            <li
                              key={idx}
                              className="flex gap-2 rounded-md px-2 py-1 text-xs leading-5"
                              style={{
                                background: awarded ? "var(--hl-accent-soft)" : "transparent",
                                color: awarded ? "var(--hl-cream)" : "var(--hl-muted)",
                              }}
                            >
                              <span className="w-8 flex-none font-bold">{lvl.label}</span>
                              <span>{lvl.description}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Skill match (v1.2) — deterministic buckets from the JD vs resume */}
            {report.skills &&
            (report.skills.matched.length > 0 ||
              report.skills.adjacent.length > 0 ||
              report.skills.missing.length > 0) ? (
              <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                    Skill match for this role
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 text-sm">
                  {(
                    [
                      [
                        "What the role asked for that your resume shows",
                        report.skills.matched,
                        "rgba(74,222,128,0.45)",
                        "rgba(74,222,128,0.08)",
                        "rgb(134,239,172)",
                      ],
                      [
                        "Related strengths you bring beyond the ask",
                        report.skills.adjacent,
                        "var(--hl-border)",
                        "var(--hl-ink-3)",
                        "var(--hl-cream)",
                      ],
                      [
                        "What the role mentions that your resume doesn't",
                        report.skills.missing,
                        "rgba(255,107,87,0.35)",
                        "rgba(255,107,87,0.07)",
                        "var(--hl-accent)",
                      ],
                    ] as Array<[string, string[], string, string, string]>
                  ).map(([label, items, border, bg, fg]) =>
                    items.length > 0 ? (
                      <div key={label}>
                        <p
                          className="text-xs font-semibold tracking-wider uppercase"
                          style={{ color: "var(--hl-muted)" }}
                        >
                          {label}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {items.map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md border px-2 py-0.5 text-xs font-medium"
                              style={{ borderColor: border, background: bg, color: fg }}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                  <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
                    Computed from the job description against your parsed resume — no AI judgment
                    involved in this part.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* How to improve (v1.2) — actionable, never a verdict */}
            {report.improve && report.improve.length > 0 ? (
              <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                    How to strengthen your application
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2 text-sm">
                    {report.improve.map((step, i) => (
                      <li
                        key={i}
                        className="flex gap-2 leading-6"
                        style={{ color: "var(--hl-mist)" }}
                      >
                        <span aria-hidden style={{ color: "var(--hl-accent)" }}>
                          →
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <p className="text-xs leading-6" style={{ color: "var(--hl-muted)" }}>
              Generated{" "}
              {report.finishedAt
                ? new Date(report.finishedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "recently"}{" "}
              · rubric v{report.rubricVersion} · This report shows only your own data and is
              revocable by the hiring team at any time. Powered by{" "}
              <Link
                href="https://github.com/abhay-yemekar/hirelens"
                className="underline underline-offset-2"
                style={{ color: "var(--hl-accent)" }}
              >
                HireLens
              </Link>{" "}
              — open-source, evidence-linked screening.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
