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
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { createJob, type Job, listJobs } from "@/lib/api";
import { cap, timeAgo } from "@/lib/format";

const STATUS_STYLE: Record<Job["status"], { bg: string; fg: string; border?: string }> = {
  draft: { bg: "transparent", fg: "var(--hl-mist)", border: "var(--hl-border)" },
  open: {
    bg: "color-mix(in oklab, var(--color-success) 16%, transparent)",
    fg: "var(--color-success)",
  },
  closed: { bg: "color-mix(in oklab, var(--hl-muted) 14%, transparent)", fg: "var(--hl-muted)" },
};

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listJobs();
      setJobs(res.jobs);
    } catch (err) {
      if (err instanceof Error && err.message.includes("unauthorized")) {
        // No active organization in this session — go pick or create one.
        router.replace("/welcome");
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createJob({ title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  }

  const inputClass =
    "w-full rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-[var(--hl-cream)] transition-shadow placeholder:text-[var(--hl-muted)] focus:outline-none focus:border-[var(--hl-accent)] focus:ring-2 focus:ring-[var(--hl-accent-soft)]";
  const inputStyle = { borderColor: "var(--hl-border)", background: "var(--hl-input)" } as const;

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">Jobs</h1>
          <p className="mt-1 text-sm text-[var(--hl-mist)]">
            Create a role, upload resumes, and run evidence-linked scoring.
          </p>
        </header>

        {error ? <NoticeBanner error={error} /> : null}

        <Card
          style={{
            background: "var(--hl-card)",
            borderColor: "var(--hl-border)",
            boxShadow: "0 24px 60px -32px rgba(3, 6, 18, 0.85)",
          }}
        >
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>New job</CardTitle>
            <CardDescription style={{ color: "var(--hl-mist)" }}>
              Describe the role — HireLens drafts the scoring rubric from your description when an
              LLM key is configured, or you can import one on the job page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--hl-mist)" }}>Job title</span>
                <input
                  required
                  placeholder="e.g. Senior Backend Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span style={{ color: "var(--hl-mist)" }}>Job description</span>
                <textarea
                  required
                  rows={4}
                  placeholder="Paste the job description…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                />
              </label>
              <Button type="submit" disabled={creating} className="self-start">
                {creating ? "Creating…" : "Create job"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <FadeIn>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-[var(--hl-cream)]">Your jobs</h2>
            {loading ? (
              <div className="flex flex-col gap-3" role="status" aria-label="Loading jobs">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[72px] animate-pulse rounded-2xl border"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                  />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 rounded-2xl border px-6 py-10 text-center"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              >
                <p className="text-sm font-medium text-[var(--hl-cream)]">No jobs yet</p>
                <p className="max-w-sm text-sm text-[var(--hl-mist)]">
                  Create your first job above — title plus a pasted description is enough to start.
                </p>
              </div>
            ) : (
              jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="group block">
                  <div
                    className="flex items-center justify-between rounded-2xl border px-5 py-4 transition-all group-hover:bg-white/[0.03] group-active:scale-[0.995] group-active:bg-white/[0.05]"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                  >
                    <div>
                      <p className="font-medium text-[var(--hl-cream)]">{job.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--hl-muted)]">
                        {timeAgo(job.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          background: STATUS_STYLE[job.status].bg,
                          color: STATUS_STYLE[job.status].fg,
                          ...(STATUS_STYLE[job.status].border
                            ? { border: `1px solid ${STATUS_STYLE[job.status].border}` }
                            : {}),
                        }}
                      >
                        {cap(job.status)}
                      </span>
                      <span
                        aria-hidden
                        className="text-lg transition-transform group-hover:translate-x-0.5"
                        style={{ color: "var(--hl-accent)" }}
                      >
                        →
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </section>
        </FadeIn>
      </div>
    </AppShell>
  );
}
