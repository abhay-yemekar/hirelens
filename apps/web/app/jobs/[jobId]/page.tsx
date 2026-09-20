"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { Eye, FileText, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { trackEvent } from "@/lib/analytics";
import {
  type CandidateRow,
  deleteCandidate,
  deleteJob,
  getJob,
  type Job,
  kickoffScore,
  listCandidates,
  listRubrics,
  listRuns,
  type RubricVersion,
  type RunRow,
  retryFailed,
  updateJob,
} from "@/lib/api";
import { candidateLabel, cap, fileLabel, modelLabel, pagesLabel, timeAgo } from "@/lib/format";
import { BiasAuditCard } from "./bias-audit";
import { ReviewTable } from "./review-table";
import { RubricEditor } from "./rubric-editor";
import { SearchAskCard } from "./search-ask";

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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

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

  function startEdit() {
    if (!job) return;
    setEditTitle(job.title);
    setEditDescription(job.description);
    setEditing(true);
  }

  function removeJob() {
    if (!job) return;
    if (
      !window.confirm(
        `Delete "${job.title}" permanently? All candidates, scores, decisions and runs go with it. The audit log records the deletion. Consider Archive instead if you may need the history.`,
      )
    )
      return;
    void run("delete-job", async () => {
      await deleteJob(jobId);
      trackEvent("job.deleted", { jobId });
      router.push("/jobs");
    });
  }

  function archiveJob() {
    if (!job) return;
    void run("archive-job", async () => {
      await updateJob(jobId, { status: "closed" });
      await load();
    });
  }

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
            {job && (
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEdit}
                  title="Edit title and job description"
                >
                  <Pencil aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <a
                  href={`/api/jobs/${jobId}/audit-export.csv`}
                  download
                  title="Download the hash-chained audit log for this job as CSV"
                  className="inline-flex h-8 items-center rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors hover:bg-[var(--hl-ink-3)]"
                  style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
                >
                  Export audit
                </a>
                {job.status !== "closed" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={archiveJob}
                    title="Close this job — it stays listed with a Closed badge, history intact"
                  >
                    Archive
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={removeJob}
                  title="Permanently delete this job and everything in it"
                  style={{
                    borderColor: "color-mix(in oklab, var(--hl-bad) 45%, transparent)",
                    color: "var(--hl-bad)",
                  }}
                >
                  <Trash2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            )}
          </div>

          {editing && job && (
            <form
              className="mt-3 flex flex-col gap-3 rounded-[var(--radius-card)] border p-4"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-3)" }}
              onSubmit={(e) => {
                e.preventDefault();
                void run("edit-job", async () => {
                  await updateJob(jobId, {
                    title: editTitle.trim() || job.title,
                    description: editDescription.trim() || job.description,
                  });
                  trackEvent("job.edited", { jobId });
                  setEditing(false);
                  await load();
                });
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span style={{ color: "var(--hl-mist)" }}>Job title</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                  required
                  className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:outline-none focus:border-[var(--hl-accent)]"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span style={{ color: "var(--hl-mist)" }}>Job description</span>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                  maxLength={100_000}
                  className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:outline-none focus:border-[var(--hl-accent)]"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy !== null}>
                  {busy === "edit-job" ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
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
          <RubricEditor
            jobId={jobId}
            rubrics={rubrics}
            onSaved={() =>
              run("rubric-save", async () => {
                await load();
              })
            }
          />
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
            )}{" "}
            {candidates.length > 0 && (
              <div
                className="overflow-hidden rounded-[var(--radius-card)] border"
                style={{ borderColor: "var(--hl-border)" }}
              >
                <ul className="divide-y divide-[var(--hl-border)] text-sm">
                  {candidates.map((c) => {
                    const pages = pagesLabel(c.pageCount);
                    const uploaded = timeAgo(c.createdAt);
                    return (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                      >
                        <FileText
                          aria-hidden
                          className="h-4 w-4 flex-none"
                          style={{ color: "var(--hl-muted)" }}
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-[14px] font-medium"
                          style={{ color: "var(--hl-cream)" }}
                          title={
                            fileLabel(c.sourceFileKey) ?? candidateLabel(c.id, c.sourceFileKey)
                          }
                        >
                          {candidateLabel(c.id, c.sourceFileKey)}
                        </span>
                        {c.contactEmail ? (
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(c.contactEmail ?? "")}
                            className="hidden min-w-0 max-w-[15rem] truncate flex-none text-xs underline-offset-2 hover:underline sm:inline"
                            style={{ color: "var(--hl-mist)" }}
                            title={`Copy email — ${c.contactEmail}`}
                          >
                            {c.contactEmail}
                          </button>
                        ) : (
                          <span
                            className="hidden flex-none text-xs sm:inline"
                            style={{ color: "var(--hl-muted)" }}
                          >
                            —
                          </span>
                        )}
                        {c.contactPhone ? (
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(c.contactPhone ?? "")}
                            className="hidden flex-none text-xs underline-offset-2 hover:underline md:inline"
                            style={{ color: "var(--hl-mist)" }}
                            title={`Copy phone — ${c.contactPhone}`}
                          >
                            {c.contactPhone}
                          </button>
                        ) : (
                          <span
                            className="hidden flex-none text-xs md:inline"
                            style={{ color: "var(--hl-muted)" }}
                          >
                            —
                          </span>
                        )}
                        {pages && (
                          <span
                            className="hidden flex-none text-xs lg:inline"
                            style={{ color: "var(--hl-muted)" }}
                          >
                            {pages}
                          </span>
                        )}
                        <span
                          className="hidden flex-none text-xs sm:inline"
                          style={{ color: "var(--hl-muted)" }}
                          title={`Uploaded ${new Date(c.createdAt).toLocaleString()}`}
                        >
                          {uploaded}
                        </span>
                        <a
                          href={`/api/jobs/${jobId}/candidates/${c.id}/resume`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View original resume — ${candidateLabel(c.id, c.sourceFileKey)}`}
                          title="View the original resume"
                          className="flex-none rounded-md border p-1.5 transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
                          style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
                        >
                          <Eye aria-hidden className="h-4 w-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeCandidate(c)}
                          disabled={busy !== null}
                          aria-label={`Remove ${candidateLabel(c.id, c.sourceFileKey)}`}
                          title="Remove this resume and its scores (recorded in the audit log)"
                          className="flex-none rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/[0.06] active:bg-white/[0.1] disabled:opacity-40"
                          style={{
                            borderColor: "color-mix(in oklab, var(--hl-bad) 45%, transparent)",
                            color: "var(--hl-bad)",
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <SearchAskCard jobId={jobId} />

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
              <div
                className="overflow-hidden rounded-[var(--radius-card)] border"
                style={{ borderColor: "var(--hl-border)" }}
              >
                <ul className="divide-y divide-[var(--hl-border)] text-sm">
                  {runs.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      {/* Spine dot — matches the reference's radio-pill marker. */}
                      <span
                        aria-hidden
                        className="flex h-6 w-6 flex-none items-center justify-center rounded-full"
                        style={{
                          background: "color-mix(in oklab, var(--hl-accent) 14%, transparent)",
                          border: "1px solid var(--hl-border)",
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              r.status === "completed"
                                ? "var(--hl-accent)"
                                : r.status === "failed"
                                  ? "var(--hl-bad)"
                                  : "var(--hl-muted)",
                          }}
                        />
                      </span>
                      <span className="min-w-0 truncate" style={{ color: "var(--hl-cream)" }}>
                        Scored with {modelLabel(r.modelId)}
                      </span>
                      <span aria-hidden style={{ color: "var(--hl-muted)" }}>
                        ·
                      </span>
                      <span
                        className="whitespace-nowrap text-xs"
                        style={{ color: "var(--hl-muted)" }}
                      >
                        rubric v{r.rubricVersion}
                      </span>
                      <span
                        className="flex-none rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            r.status === "completed"
                              ? "color-mix(in oklab, var(--color-success) 18%, transparent)"
                              : r.status === "failed"
                                ? "color-mix(in oklab, var(--color-danger) 14%, transparent)"
                                : "transparent",
                          color:
                            r.status === "completed"
                              ? "var(--color-success)"
                              : r.status === "failed"
                                ? "var(--color-danger)"
                                : "var(--hl-muted)",
                          ...(r.status === "running"
                            ? { border: "1px solid var(--hl-border)" }
                            : {}),
                        }}
                      >
                        {cap(r.status)}
                      </span>
                      <span
                        className="flex-none text-xs"
                        style={{ color: "var(--hl-muted)" }}
                        title={
                          r.finishedAt
                            ? `Finished ${new Date(r.finishedAt).toLocaleString()}`
                            : undefined
                        }
                      >
                        {r.finishedAt ? timeAgo(r.finishedAt) : ""}
                      </span>
                      <Link href={`/jobs/${jobId}/runs/${r.id}`} className="ml-auto">
                        <Button variant="outline" size="sm">
                          View results →
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
