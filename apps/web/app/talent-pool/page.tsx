"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useSideGuard } from "@/lib/use-side-guard";

/**
 * Talent pool (v1.4) — rediscovery across every job in the workspace:
 * find the strong Kafka engineer from a closed req six months ago
 * without remembering which job they applied to. Filters mirror the API:
 * identity search, skills, stage, and a rubric-weighted minimum score.
 */

interface PoolRow {
  id: string;
  jobId: string;
  jobTitle: string;
  label: string | null;
  contactEmail: string | null;
  stage: string | null;
  createdAt: string;
  skills: string[];
  overall: number | null;
}

interface PoolResponse {
  ok: boolean;
  candidates: PoolRow[];
  total: number;
  page: number;
  pageSize: number;
  facets: { stages: Record<string, number>; skills: Array<{ skill: string; count: number }> };
}

const STAGES = ["new", "shortlisted", "advanced", "rejected"] as const;

const STAGE_COLOR: Record<string, { background: string; color: string }> = {
  shortlisted: {
    background: "color-mix(in oklab, var(--color-success) 16%, transparent)",
    color: "var(--color-success)",
  },
  advanced: { background: "var(--hl-accent-soft)", color: "var(--hl-accent)" },
  rejected: {
    background: "color-mix(in oklab, var(--hl-muted) 14%, transparent)",
    color: "var(--hl-muted)",
  },
  new: {
    background: "color-mix(in oklab, var(--hl-warn) 14%, transparent)",
    color: "var(--hl-warn)",
  },
};

export default function TalentPoolPage() {
  const { guarding } = useSideGuard("recruiter");
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [stage, setStage] = useState("");
  const [minScore, setMinScore] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PoolResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [shortlisting, setShortlisting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (skill) params.set("skills", skill);
      if (stage) params.set("stage", stage);
      if (minScore.trim()) params.set("minScore", minScore.trim());
      params.set("page", String(page));
      const res = await apiFetch<PoolResponse>(`/api/talent-pool?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [q, skill, stage, minScore, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetToFirstPage(next: {
    q?: string;
    skill?: string;
    stage?: string;
    minScore?: string;
  }) {
    setPage(1);
    if (next.q !== undefined) setQ(next.q);
    if (next.skill !== undefined) setSkill(next.skill);
    if (next.stage !== undefined) setStage(next.stage);
    if (next.minScore !== undefined) setMinScore(next.minScore);
  }

  async function shortlist(candidateId: string) {
    setShortlisting(candidateId);
    try {
      await apiFetch("/api/talent-pool/shortlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId, reason: "Rediscovered from the talent pool" }),
      });
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setShortlisting(null);
    }
  }

  if (guarding) {
    return (
      <AppShell>
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          Loading…
        </p>
      </AppShell>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const facets = data?.facets;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
            Talent pool
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--hl-mist)]">
            Every candidate across every job in your workspace — rediscover strong people from
            closed reqs by skill, score, or outcome.
          </p>
        </header>

        {/* Filters: identity search, stage, minimum score, skill chips. */}
        <Card
          style={{
            background: "var(--hl-card)",
            borderColor: "var(--hl-border)",
          }}
        >
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  resetToFirstPage({});
                }}
              >
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name-file, email, or phone…"
                  aria-label="Search candidates"
                  className="h-10 w-full rounded-lg border px-3 text-sm placeholder:text-[var(--hl-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--hl-accent-soft)]"
                  style={{
                    borderColor: "var(--hl-border)",
                    background: "var(--hl-input)",
                    color: "var(--hl-cream)",
                  }}
                />
                <Button
                  type="submit"
                  variant="outline"
                  style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                >
                  Search
                </Button>
              </form>
              <div className="flex gap-2">
                <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--hl-mist)" }}>
                  Stage
                  <select
                    value={stage}
                    onChange={(e) => resetToFirstPage({ stage: e.target.value })}
                    className="h-10 rounded-lg border px-2 text-sm"
                    style={{
                      borderColor: "var(--hl-border)",
                      background: "var(--hl-input)",
                      color: "var(--hl-cream)",
                    }}
                  >
                    <option value="">All</option>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                        {facets?.stages[s] ? ` (${facets.stages[s]})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--hl-mist)" }}>
                  Min score
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    onBlur={() => resetToFirstPage({})}
                    placeholder="—"
                    className="h-10 w-20 rounded-lg border px-2 text-sm"
                    style={{
                      borderColor: "var(--hl-border)",
                      background: "var(--hl-input)",
                      color: "var(--hl-cream)",
                    }}
                  />
                </label>
              </div>
            </div>
            {facets && facets.skills.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {facets.skills.map((f) => {
                  const active = skill === f.skill;
                  return (
                    <button
                      key={f.skill}
                      type="button"
                      onClick={() => resetToFirstPage({ skill: active ? "" : f.skill })}
                      className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                      style={
                        active
                          ? {
                              background: "var(--hl-accent)",
                              color: "var(--hl-ink)",
                              borderColor: "var(--hl-accent)",
                            }
                          : { borderColor: "var(--hl-border)", color: "var(--hl-mist)" }
                      }
                    >
                      {f.skill} · {f.count}
                    </button>
                  );
                })}
                {skill || stage || minScore || q ? (
                  <button
                    type="button"
                    onClick={() => resetToFirstPage({ q: "", skill: "", stage: "", minScore: "" })}
                    className="text-xs underline"
                    style={{ color: "var(--hl-muted)" }}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {error ? <NoticeBanner error={error} /> : null}

        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading talent pool">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-2xl border"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              />
            ))}
          </div>
        ) : data && data.candidates.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-2xl border px-6 py-12 text-center"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <p className="text-sm font-medium text-[var(--hl-cream)]">
              No one matches those filters
            </p>
            <p className="max-w-sm text-sm text-[var(--hl-mist)]">
              Try a broader search, a lower minimum score, or clear the filters to see the whole
              pool.
            </p>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            {data?.candidates.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--hl-cream)]">{r.label ?? "Candidate"}</p>
                    {r.overall !== null ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                        style={{ background: "var(--hl-accent-soft)", color: "var(--hl-accent)" }}
                      >
                        {r.overall}/100
                      </span>
                    ) : null}
                    {r.stage ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                        style={
                          STAGE_COLOR[r.stage] ?? {
                            background: "transparent",
                            color: "var(--hl-mist)",
                          }
                        }
                      >
                        {r.stage}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--hl-muted)" }}>
                    <Link
                      href={`/jobs/${r.jobId}`}
                      className="hover:underline"
                      style={{ color: "var(--hl-mist)" }}
                    >
                      {r.jobTitle}
                    </Link>
                    {" · "}
                    {timeAgo(r.createdAt)}
                    {r.contactEmail ? ` · ${r.contactEmail}` : ""}
                  </p>
                  {r.skills.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.skills.slice(0, 6).map((s) => (
                        <span
                          key={s}
                          className="rounded border px-1.5 py-0.5 text-[11px]"
                          style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
                        >
                          {s}
                        </span>
                      ))}
                      {r.skills.length > 6 ? (
                        <span className="text-[11px]" style={{ color: "var(--hl-muted)" }}>
                          +{r.skills.length - 6}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <Button
                    variant="outline"
                    disabled={shortlisting === r.id}
                    onClick={() => void shortlist(r.id)}
                    style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                    title="Record a shortlist decision on this candidate's job (audited)"
                  >
                    {shortlisting === r.id ? "Adding…" : "Shortlist"}
                  </Button>
                </div>
              </div>
            ))}
            {data && totalPages > 1 ? (
              <div
                className="flex items-center justify-between pt-2 text-sm"
                style={{ color: "var(--hl-mist)" }}
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
                  style={{ borderColor: "var(--hl-border)" }}
                >
                  ← Previous
                </button>
                <span className="tabular-nums">
                  Page {data.page} of {totalPages} · {data.total} people
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
                  style={{ borderColor: "var(--hl-border)" }}
                >
                  Next →
                </button>
              </div>
            ) : null}
          </section>
        )}

        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: "var(--hl-cream)" }}>
              How this works
            </CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              Scores come from each candidate's most recent completed run, weighted by that job's
              rubric — the same number their report shows. Shortlisting writes a regular, audited
              decision on the candidate's job, so it shows up in review, analytics, and bias audits.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
