"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : "Failed to load job");
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
      setError(err instanceof Error ? err.message : "Something went wrong");
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

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/jobs" className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            ← Jobs
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{job?.title ?? "…"}</h1>
        </div>
      </header>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {/* Rubrics */}
      <Card>
        <CardHeader>
          <CardTitle>Rubric</CardTitle>
          <CardDescription>
            Criteria candidates are scored against. Versions are immutable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {rubrics.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              No rubric yet — import one to enable scoring.
            </p>
          ) : (
            rubrics.map((r) => (
              <span
                key={r.id}
                className="rounded-[var(--radius-pill)] px-3 py-1 text-sm"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-fg-muted)",
                }}
              >
                v{r.version}
              </span>
            ))
          )}
          <Button
            variant="outline"
            disabled={busy !== null}
            className="ml-auto"
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
      <Card>
        <CardHeader>
          <CardTitle>Candidates ({candidates.length})</CardTitle>
          <CardDescription>Upload resumes (txt, md, pdf). Duplicates are deduped.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf"
            className="text-sm"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          {candidates.length > 0 && (
            <ul className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              {candidates.map((c) => (
                <li key={c.id}>
                  {c.sourceFileKey ?? c.id.slice(0, 8)}
                  {c.pageCount !== null ? ` · ${c.pageCount}p` : ""}
                  {c.language ? ` · ${c.language}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <BiasAuditCard jobId={jobId} />

      {/* Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
          <CardDescription>Score all candidates against the latest rubric version.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Button
              disabled={busy !== null || rubrics.length === 0 || candidates.length === 0}
              onClick={() =>
                run("score", async () => {
                  await kickoffScore(jobId);
                  await load();
                })
              }
            >
              {busy === "score" ? "Scoring…" : "Score all candidates"}
            </Button>
          </div>

          <ReviewTable jobId={jobId} />

          {runs.length > 0 && (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    Run · v{r.rubricVersion} · {r.modelId}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className="rounded-[var(--radius-pill)] px-2 py-0.5"
                      style={{
                        background: "var(--color-surface-raised)",
                        color:
                          r.status === "completed"
                            ? "var(--color-success)"
                            : "var(--color-fg-muted)",
                      }}
                    >
                      {r.status}
                    </span>
                    <Link
                      href={`/jobs/${jobId}/runs/${r.id}`}
                      className="underline"
                      style={{ color: "var(--color-accent)" }}
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
    </main>
  );
}
