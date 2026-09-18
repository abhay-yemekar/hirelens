"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { trackEvent } from "@/lib/analytics";
import {
  type CandidateRow,
  deleteCandidate,
  getJob,
  importRubric,
  type Job,
  kickoffScore,
  listCandidates,
  listRubrics,
  listRuns,
  type RubricVersion,
  type RunRow,
  retryFailed,
} from "@/lib/api";
import {
  candidateLabel,
  cap,
  fileLabel,
  languageName,
  modelLabel,
  pagesLabel,
  timeAgo,
} from "@/lib/format";
import { BiasAuditCard } from "./bias-audit";
import { ReviewTable } from "./review-table";

/** The demo rubric imported by "Use the demo rubric" (valid RubricSchema shape). */
function demoRubric() {
  const levels = [0, 1, 2, 3, 4, 5].map((n) => ({
    label: String(n),
    description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
  }));
  return {
    version: 1,
    key: "backend-eng",
    title: "Backend Engineer",
    criteria: ["system-design", "databases", "testing", "ops", "communication"].map((key) => ({
      key,
      title: key,
      weight: 1,
      scale: levels,
      doNotUse: [],
    })),
    exclusions: [],
  };
}

interface ZipSummary {
  created: number;
  duplicates: number;
  skipped: Array<{ name: string; reason: string }>;
}

/** What happened in the latest scoring batch — drives the results banner. */
interface ScoreSummary {
  runId: string;
  total: number;
  scored: number;
  failed: number;
  results: Array<{ candidateId: string; ok: boolean; error?: string }>;
}

/** Rate-limit/quota errors read as server noise — translate to plain cause. */
function friendlyFailure(error: string): string {
  return /rate.?limit|quota|429|503|resource.?exhausted|too many requests/i.test(error)
    ? "the AI provider rate-limited the request"
    : error.length > 140
      ? `${error.slice(0, 140)}…`
      : error;
}

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const fileRef = useRef<HTMLInputElement>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [rubrics, setRubrics] = useState<RubricVersion[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [zipSummary, setZipSummary] = useState<ZipSummary | null>(null);
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [j, r, c, rn] = await Promise.all([
        getJob(jobId),
        listRubrics(jobId),
        listCandidates(jobId),
        listRuns(jobId),
      ]);
      setJob(j.job);
      setRubrics(r.rubrics);
      setCandidates(c.candidates);
      setRuns(rn.runs);
    } catch (err) {
      setError(err);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const uploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void run("upload", async () => {
      let summary: ZipSummary | null = null;
      for (const file of Array.from(files)) {
        const isZip = file.name.toLowerCase().endsWith(".zip");
        const endpoint = isZip
          ? `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/api/jobs/${jobId}/candidates/zip`
          : `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/api/jobs/${jobId}/candidates`;
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(endpoint, { method: "POST", body: form, credentials: "include" });
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          created?: number;
          duplicates?: number;
          skipped?: Array<{ name: string; reason: string }>;
        };
        if (!res.ok) {
          throw new Error(body.message ?? `Upload failed (${res.status})`);
        }
        if (isZip && typeof body.created === "number") {
          summary = {
            created: body.created,
            duplicates: body.duplicates ?? 0,
            skipped: body.skipped ?? [],
          };
        }
      }
      setZipSummary(summary);
      await load();
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  function removeCandidate(candidate: CandidateRow) {
    const label = candidateLabel(candidate.id, candidate.sourceFileKey);
    if (
      !window.confirm(
        `Remove ${label}? Their scores and review history go with them, and the removal is recorded in the audit log.`,
      )
    )
      return;
    void run("remove", async () => {
      await deleteCandidate(jobId, candidate.id);
      await load();
    });
  }

  const latestRubricVersion = rubrics[rubrics.length - 1]?.version;
  const scoreBlocker =
    rubrics.length === 0
      ? "Add a rubric first — use the demo rubric above to get started"
      : candidates.length === 0
        ? "Upload at least one resume first"
        : null;

  // Candidates the newest failure-carrying run could not score — surfaced in
  // the review queue so nobody silently vanishes (the review endpoint only
  // returns candidates that have score rows).
  const failedRun = runs.find((r) => (r.failures?.length ?? 0) > 0) ?? null;
  const failedRows = (failedRun?.failures ?? []).map((f) => ({
    candidateId: f.candidateId,
    label: fileLabel(candidates.find((c) => c.id === f.candidateId)?.sourceFileKey ?? null),
    error: f.error,
  }));

  async function retryAllFailed() {
    if (!failedRun) return;
    await run("retry", async () => {
      const res = await retryFailed(jobId, failedRun.id);
      setScoreSummary(res.summary);
      await load();
    });
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <Link
            href="/jobs"
            className="text-sm transition-colors hover:text-[var(--hl-cream)]"
            style={{ color: "var(--hl-mist)" }}
          >
            ← Jobs
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
              {job?.title ?? "…"}
            </h1>
            {job && (
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  background: "transparent",
                  border: "1px solid var(--hl-border)",
                  color: "var(--hl-mist)",
                }}
              >
                {cap(job.status)}
              </span>
            )}
          </div>
        </header>
        {error ? <NoticeBanner error={error} /> : null}

        {/* Rubric */}
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>Rubric</CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              The scorecard the AI grades against: a list of criteria (like System design or
              Communication), each scored on a 0–5 scale. Every candidate gets one score per
              criterion, combined into an overall score with cited evidence you can open and read.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {rubrics.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
                  No rubric yet — use the demo rubric below to try scoring end-to-end.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {rubrics.map((r, i) => (
                    <span
                      key={r.id}
                      className="rounded-full px-3 py-1 text-sm"
                      title={
                        i === rubrics.length - 1
                          ? `Version ${r.version} — the one scoring uses right now`
                          : `Version ${r.version} — kept for the audit trail; only the newest version is used`
                      }
                      style={
                        i === rubrics.length - 1
                          ? {
                              background: "var(--hl-accent)",
                              color: "var(--hl-ink)",
                              fontWeight: 600,
                            }
                          : {
                              background: "transparent",
                              color: "var(--hl-muted)",
                              border: "1px solid var(--hl-border)",
                            }
                      }
                    >
                      v{r.version}
                      {i === rubrics.length - 1 ? " · active" : ""}
                    </span>
                  ))}
                  <span className="text-xs" style={{ color: "var(--hl-muted)" }}>
                    Scoring always uses the newest version — older ones stay for the audit trail.
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                disabled={busy !== null}
                className="ml-auto"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
                title="Loads a sample scorecard so you can try scoring without waiting for AI rubric drafting"
                onClick={() =>
                  run("rubric", async () => {
                    await importRubric(jobId, demoRubric());
                    await load();
                  })
                }
              >
                {busy === "rubric" ? "Importing…" : "Use the demo rubric"}
              </Button>
            </div>
            <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
              With an LLM key configured, HireLens can also draft a rubric automatically from the
              job description — the docs and CLI call this "deriving".
            </p>
          </CardContent>
        </Card>

        {/* Candidates */}
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>
              Candidates ({candidates.length})
            </CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              Upload resumes one by one, or zip them all together. Duplicates are skipped
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-7 text-center text-sm transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
              style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
            >
              <span className="font-medium text-[var(--hl-cream)]">Choose resume files</span>
              <span style={{ color: "var(--hl-muted)" }}>
                or drop them here — PDF, TXT, MD, or a ZIP with many resumes
              </span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".txt,.md,.pdf,.zip"
                className="sr-only"
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </label>

            {zipSummary && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "color-mix(in oklab, var(--color-success) 12%, transparent)",
                  color: "var(--hl-cream)",
                }}
                role="status"
              >
                ZIP processed: {zipSummary.created} added
                {zipSummary.duplicates > 0
                  ? `, ${zipSummary.duplicates} duplicate${zipSummary.duplicates === 1 ? "" : "s"} skipped`
                  : ""}
                {zipSummary.skipped.length > 0
                  ? `, ${zipSummary.skipped.length} unreadable (${zipSummary.skipped
                      .slice(0, 3)
                      .map((s) => `${s.name} — ${s.reason}`)
                      .join("; ")}${zipSummary.skipped.length > 3 ? "…" : ""})`
                  : ""}
                .
              </div>
            )}

            {candidates.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {candidates.map((c) => {
                  const pages = pagesLabel(c.pageCount);
                  const uploaded = timeAgo(c.createdAt);
                  return (
                    <li
                      key={c.id}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                      style={{ background: "var(--hl-ink-3)" }}
                    >
                      <span
                        className="truncate text-[13px] font-medium"
                        style={{ color: "var(--hl-cream)" }}
                        title={fileLabel(c.sourceFileKey) ?? candidateLabel(c.id, c.sourceFileKey)}
                      >
                        {candidateLabel(c.id, c.sourceFileKey)}
                      </span>
                      {pages && (
                        <span
                          className="flex-none rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "var(--hl-card)", color: "var(--hl-muted)" }}
                        >
                          {pages}
                        </span>
                      )}
                      {c.language && (
                        <span
                          className="flex-none rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "var(--hl-card)", color: "var(--hl-muted)" }}
                        >
                          {languageName(c.language)}
                        </span>
                      )}
                      <span
                        className="hidden flex-none text-xs sm:inline"
                        style={{ color: "var(--hl-muted)" }}
                        title={`Uploaded ${new Date(c.createdAt).toLocaleString()}`}
                      >
                        {uploaded}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCandidate(c)}
                        disabled={busy !== null}
                        aria-label={`Remove ${candidateLabel(c.id, c.sourceFileKey)}`}
                        title="Remove this resume and its scores (recorded in the audit log)"
                        className="ml-auto flex-none rounded px-2 py-1 text-xs transition-colors hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-40"
                        style={{ color: "var(--hl-bad)" }}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <BiasAuditCard jobId={jobId} />

        {/* Scoring */}
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>Scoring</CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              The AI reads every resume and grades it against the active rubric: one 0–5 score per
              criterion with a quoted snippet as evidence, combined into an overall score. Results
              land in the review queue below, where you make the actual decisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                disabled={busy !== null || scoreBlocker !== null}
                onClick={() =>
                  run("score", async () => {
                    const res = await kickoffScore(jobId);
                    setScoreSummary(res.summary);
                    trackEvent("scoring.kickoff", { jobId });
                    await load();
                  })
                }
              >
                {busy === "score" ? "Scoring…" : "Score all candidates"}
              </Button>
              {scoreBlocker && (
                <span className="text-sm" style={{ color: "var(--hl-muted)" }}>
                  {scoreBlocker}.
                </span>
              )}
              {!scoreBlocker && (
                <span className="text-sm" style={{ color: "var(--hl-muted)" }}>
                  {candidates.length} candidate{candidates.length === 1 ? "" : "s"} · rubric v
                  {latestRubricVersion}
                </span>
              )}
            </div>

            <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
              Scoring runs on the server's configured LLM (self-hosted: your own API key — see{" "}
              <Link
                href="/docs/self-hosting"
                className="underline underline-offset-2 transition-opacity hover:opacity-85"
                style={{ color: "var(--hl-accent)" }}
              >
                model &amp; API key setup
              </Link>
              ).
            </p>

            {scoreSummary && (
              <div
                role="status"
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-sm"
                style={{
                  background:
                    scoreSummary.failed === 0
                      ? "color-mix(in oklab, var(--color-success) 12%, transparent)"
                      : "color-mix(in oklab, var(--color-warning) 14%, transparent)",
                  color: "var(--hl-cream)",
                }}
              >
                {scoreSummary.failed === 0 ? (
                  <span>
                    ✓ Scored {scoreSummary.scored} of {scoreSummary.total} candidate
                    {scoreSummary.total === 1 ? "" : "s"}.
                  </span>
                ) : (
                  <>
                    <span>
                      Scored {scoreSummary.scored} of {scoreSummary.total}. Could not score:{" "}
                      {scoreSummary.results
                        .filter((r) => !r.ok)
                        .map((r) => {
                          const label =
                            fileLabel(
                              candidates.find((c) => c.id === r.candidateId)?.sourceFileKey ?? null,
                            ) ?? r.candidateId.slice(0, 8);
                          return `${label} (${friendlyFailure(r.error ?? "unknown error")})`;
                        })
                        .join(", ")}
                      .
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void retryAllFailed()}
                    >
                      {busy === "retry" ? "Retrying…" : "Retry failed"}
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setScoreSummary(null)}
                  className="ml-auto rounded px-2 py-1 text-xs transition-colors hover:bg-white/[0.08]"
                  style={{ color: "var(--hl-mist)" }}
                >
                  ✕
                </button>
              </div>
            )}

            <ReviewTable
              jobId={jobId}
              failed={failedRows}
              onRetryFailed={failedRun ? () => void retryAllFailed() : undefined}
            />

            {runs.length > 0 && (
              <ul className="flex flex-col gap-2">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm"
                    style={{ background: "var(--hl-ink-3)" }}
                  >
                    <span style={{ color: "var(--hl-mist)" }}>
                      Scored with {modelLabel(r.modelId)} · rubric v{r.rubricVersion} ·{" "}
                      <span
                        style={{
                          color:
                            r.status === "completed"
                              ? "var(--color-success)"
                              : r.status === "failed"
                                ? "var(--hl-bad)"
                                : "var(--hl-muted)",
                        }}
                      >
                        {cap(r.status)}
                      </span>
                      {r.finishedAt ? ` · ${timeAgo(r.finishedAt)}` : ""}
                    </span>
                    <Link
                      href={`/jobs/${jobId}/runs/${r.id}`}
                      className="underline underline-offset-2"
                      style={{ color: "var(--hl-accent)" }}
                    >
                      View results →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
