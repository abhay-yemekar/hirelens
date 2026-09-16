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
  getJob,
  importRubric,
  type Job,
  kickoffScore,
  listCandidates,
  listRubrics,
  listRuns,
  type RubricVersion,
  type RunRow,
} from "@/lib/api";
import { BiasAuditCard } from "./bias-audit";
import { ReviewTable } from "./review-table";

/** The demo rubric imported by "Import demo rubric" (valid RubricSchema shape). */
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

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const fileRef = useRef<HTMLInputElement>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [rubrics, setRubrics] = useState<RubricVersion[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<unknown>(null);
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
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(
          `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/api/jobs/${jobId}/candidates`,
          {
            method: "POST",
            body: form,
            credentials: "include",
          },
        );
        if (!res.ok && res.status !== 200) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? `Upload failed (${res.status})`);
        }
      }
      await load();
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const scoreBlocker =
    rubrics.length === 0
      ? "Import a rubric first"
      : candidates.length === 0
        ? "Upload at least one resume first"
        : null;

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
                  background: "var(--hl-card)",
                  border: "1px solid var(--hl-border)",
                  color: "var(--hl-mist)",
                }}
              >
                {job.status}
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
              Criteria candidates are scored against. Versions are immutable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {rubrics.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
                No rubric yet — import the demo rubric to try scoring, or derive one from the job
                description with an LLM key configured.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rubrics.map((r) => (
                  <span
                    key={r.id}
                    className="rounded-full px-3 py-1 text-sm"
                    style={{
                      background: "var(--hl-accent-soft)",
                      color: "var(--hl-accent)",
                      border: "1px solid var(--hl-border)",
                    }}
                  >
                    v{r.version}
                  </span>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              disabled={busy !== null}
              className="ml-auto"
              style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
              onClick={() =>
                run("rubric", async () => {
                  await importRubric(jobId, demoRubric());
                  await load();
                })
              }
            >
              {busy === "rubric" ? "Importing…" : "Import demo rubric"}
            </Button>
          </CardContent>
        </Card>

        {/* Candidates */}
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>
              Candidates ({candidates.length})
            </CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              Upload resumes (txt, md, pdf). Duplicates are deduped.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-white/[0.03]"
              style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
            >
              <span className="font-medium text-[var(--hl-cream)]">Choose resume files</span>
              <span style={{ color: "var(--hl-muted)" }}>or drop them here — txt, md, pdf</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".txt,.md,.pdf"
                className="sr-only"
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </label>
            {candidates.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: "var(--hl-ink-3)", color: "var(--hl-mist)" }}
                  >
                    <span className="font-mono text-xs" style={{ color: "var(--hl-muted)" }}>
                      {(c.sourceFileKey ?? c.id.slice(0, 8)).split("/").pop()}
                    </span>
                    {c.pageCount !== null && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--hl-card)", color: "var(--hl-muted)" }}
                      >
                        {c.pageCount}p
                      </span>
                    )}
                    {c.language && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--hl-card)", color: "var(--hl-muted)" }}
                      >
                        {c.language}
                      </span>
                    )}
                  </li>
                ))}
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
              Score all candidates against the latest rubric version.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={busy !== null || scoreBlocker !== null}
                onClick={() =>
                  run("score", async () => {
                    await kickoffScore(jobId);
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
                  {rubrics[rubrics.length - 1]?.version ?? "?"}
                </span>
              )}
            </div>

            <ReviewTable jobId={jobId} />

            {runs.length > 0 && (
              <ul className="flex flex-col gap-2">
                {runs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{ background: "var(--hl-ink-3)" }}
                  >
                    <span style={{ color: "var(--hl-mist)" }}>
                      Run · rubric v{r.rubricVersion} ·{" "}
                      <span className="font-mono text-xs">{r.modelId}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          background: "var(--hl-card)",
                          color:
                            r.status === "completed"
                              ? "var(--color-success)"
                              : r.status === "failed"
                                ? "var(--color-danger)"
                                : "var(--hl-muted)",
                        }}
                      >
                        {r.status}
                      </span>
                      <Link
                        href={`/jobs/${jobId}/runs/${r.id}`}
                        className="underline underline-offset-2"
                        style={{ color: "var(--hl-accent)" }}
                      >
                        Results →
                      </Link>
                    </span>
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
