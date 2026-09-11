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
import { createJob, type Job, listJobs } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";

export default function JobsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            {session?.user?.email ? `Signed in as ${session.user.email}` : ""}
          </p>
        </div>
        <Button variant="ghost" onClick={() => signOut().then(() => (window.location.href = "/"))}>
          Sign out
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New job</CardTitle>
          <CardDescription>Describe the role; a rubric is derived from it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <input
              required
              placeholder="Job title — e.g. Senior Backend Engineer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-[var(--radius-control)] border px-3 py-2"
              style={{
                borderColor: "var(--color-border-subtle)",
                background: "var(--color-surface-raised)",
              }}
            />
            <textarea
              required
              rows={4}
              placeholder="Paste the job description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-[var(--radius-control)] border px-3 py-2"
              style={{
                borderColor: "var(--color-border-subtle)",
                background: "var(--color-surface-raised)",
              }}
            />
            <Button type="submit" disabled={creating} className="self-start">
              {creating ? "Creating…" : "Create job"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <FadeIn>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Your jobs</h2>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              Loading…
            </p>
          ) : jobs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              No jobs yet — create your first one above.
            </p>
          ) : (
            jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                <Card className="transition-opacity hover:opacity-90">
                  <CardContent className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{job.title}</p>
                      <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                        {new Date(job.createdAt).toLocaleDateString()} · {job.status}
                      </p>
                    </div>
                    <span aria-hidden className="text-lg">
                      →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </section>
      </FadeIn>
    </main>
  );
}
