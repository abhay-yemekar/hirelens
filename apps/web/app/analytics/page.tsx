"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { apiFetch } from "@/lib/api";

/**
 * Org analytics dashboard (v1.2) — the recruiter-side counterpart to the
 * candidate-side depth. Read-only aggregates: jobs, pipeline, score
 * distribution, decision speed, bias outcomes. Charts are plain CSS/SVG
 * (no chart library — zero bundle cost, fully brandable).
 */

interface Analytics {
  jobs: { total: number; byStatus: Record<string, number> };
  pipeline: Record<string, number>;
  decisions: { total: number };
  scores: { avgCriterion: number | null; distribution: Array<{ band: string; count: number }> };
  speed: { medianHoursToDecision: number | null };
  bias: { auditsRun: number; lastFlaggedJobTitle: string | null };
  generatedAt: string;
}

const PIPELINE_ORDER = ["new", "shortlisted", "advanced", "rejected"] as const;

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const res = await apiFetch<{ ok: true; analytics: Analytics }>("/api/analytics");
        setData(res.analytics);
      } catch (err) {
        setError(err);
      }
    })();
  }, []);

  const maxPipeline = data ? Math.max(1, ...Object.values(data.pipeline)) : 1;
  const maxBand = data ? Math.max(1, ...data.scores.distribution.map((d) => d.count)) : 1;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
              Analytics
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--hl-mist)" }}>
              Hiring pipeline across every job in your workspace.
            </p>
          </div>
          {data ? (
            <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </header>

        {error ? <NoticeBanner error={error} /> : null}

        {data === null && !error ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Loading…
          </p>
        ) : null}

        {data ? (
          <>
            {/* Headline numbers */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Jobs",
                  value: String(data.jobs.total),
                  sub: `${data.decisions.total} decisions made`,
                },
                {
                  label: "Median time to decision",
                  value: fmtHours(data.speed.medianHoursToDecision),
                  sub: "from resume upload",
                },
                {
                  label: "Avg criterion score",
                  value:
                    data.scores.avgCriterion === null ? "—" : `${data.scores.avgCriterion} / 5`,
                  sub: "across all scoring runs",
                },
                {
                  label: "Bias audits run",
                  value: String(data.bias.auditsRun),
                  sub: data.bias.lastFlaggedJobTitle
                    ? `Flagged: ${data.bias.lastFlaggedJobTitle}`
                    : "none flagged",
                },
              ].map((card) => (
                <Card
                  key={card.label}
                  style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
                >
                  <CardHeader className="pb-2">
                    <CardDescription style={{ color: "var(--hl-muted)" }}>
                      {card.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold tabular-nums text-[var(--hl-cream)]">
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--hl-muted)" }}>
                      {card.sub}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Pipeline funnel */}
              <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                    Pipeline
                  </CardTitle>
                  <CardDescription style={{ color: "var(--color-fg-muted)" }}>
                    Every candidate at their latest stage.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {PIPELINE_ORDER.map((stage) => {
                    const count = data.pipeline[stage] ?? 0;
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <span
                          className="w-24 flex-none text-xs font-medium capitalize"
                          style={{ color: "var(--hl-mist)" }}
                        >
                          {stage}
                        </span>
                        <div className="h-5 flex-1 overflow-hidden rounded-md bg-[var(--hl-ink-2)]">
                          <div
                            className="h-full rounded-md transition-all"
                            style={{
                              width: `${Math.round((count / maxPipeline) * 100)}%`,
                              background:
                                stage === "rejected"
                                  ? "rgba(255,107,87,0.55)"
                                  : "var(--hl-accent-soft)",
                              borderLeft: "3px solid var(--hl-accent)",
                            }}
                          />
                        </div>
                        <span
                          className="w-10 flex-none text-right text-sm tabular-nums"
                          style={{ color: "var(--hl-cream)" }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Score distribution */}
              <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
                <CardHeader>
                  <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
                    Score distribution
                  </CardTitle>
                  <CardDescription style={{ color: "var(--color-fg-muted)" }}>
                    Every criterion score from every run, 0–5.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex h-[148px] items-end justify-between gap-2">
                  {data.scores.distribution.map((d) => (
                    <div
                      key={d.band}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    >
                      <span className="text-xs tabular-nums" style={{ color: "var(--hl-mist)" }}>
                        {d.count > 0 ? d.count : ""}
                      </span>
                      <div
                        className="w-full rounded-t-md"
                        style={{
                          height: `${Math.round((d.count / maxBand) * 100)}%`,
                          minHeight: d.count > 0 ? 4 : 2,
                          background: d.count > 0 ? "var(--hl-accent-soft)" : "var(--hl-ink-2)",
                          borderTop: d.count > 0 ? "3px solid var(--hl-accent)" : "none",
                        }}
                        aria-hidden
                      />
                      <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
                        {d.band}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
              Aggregates only — no candidate-level data on this page. Per-job deep dives live on
              each job's page; the audit trail is exportable from any job.
            </p>
          </>
        ) : null}

        <div className="flex gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/jobs">← Jobs</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
