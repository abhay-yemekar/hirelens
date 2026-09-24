/**
 * Wave 6 — public Score-my-resume page (the candidate-side funnel).
 *
 * Paste or upload a resume + paste a job description → instant score from
 * the same engine recruiters use. No account, nothing stored. Live on
 * /self-check, linked from the marketing site's candidate surfaces.
 */
"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useRef, useState } from "react";

interface CriterionResult {
  key: string;
  title: string;
  score: number;
  rationale: string;
  evidence: { quotedText: string; start: number; end: number }[];
}

interface SkillBuckets {
  matched: string[];
  adjacent: string[];
  missing: string[];
}

interface SelfCheckResult {
  overall: number;
  mode: "llm" | "approximate";
  derivedBy?: "llm" | "generic";
  criteria?: CriterionResult[];
  keywords?: { word: string; found: boolean }[];
  skills?: SkillBuckets;
  matchPct?: number;
  improve?: string[];
}

function SkillSection({
  label,
  items,
  border,
  bg,
  fg,
}: {
  label: string;
  items: string[];
  border: string;
  bg: string;
  fg: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--hl-mist)]">
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
  );
}

function ImproveCard({ steps, onDownload }: { steps: string[]; onDownload: () => void }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">How to strengthen your application</CardTitle>
        <CardDescription>Actionable steps, weakest area first — never a verdict.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2 leading-6 text-[var(--hl-mist)]">
              <span aria-hidden className="text-[var(--hl-warn)]">
                →
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onDownload}
          className="mt-4 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/[0.06]"
          style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
        >
          ↓ Download my plan (.md)
        </button>
      </CardContent>
    </Card>
  );
}

const SAMPLE_JD = `We are hiring a Backend Engineer with 2+ years of experience.
Requirements: strong Python, FastAPI or Django, REST API design, SQL databases
(Postgres), and experience shipping production services. Familiarity with Docker,
CI/CD and cloud platforms is a plus. You will own features end to end, from design
through deployment, and collaborate with frontend engineers on a React codebase.`;

function band(overall: number): { label: string; tone: string } {
  if (overall >= 75) return { label: "Strong match — interview-ready", tone: "text-emerald-500" };
  if (overall >= 50)
    return { label: "Promising match — sharpen a few areas", tone: "text-amber-500" };
  return { label: "Emerging match — focus on the flagged criteria", tone: "text-[var(--hl-warn)]" };
}

export default function SelfCheckPage() {
  const [resumeText, setResumeText] = useState("");
  const [jd, setJd] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelfCheckResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      if (fileName && fileRef.current?.files?.[0]) {
        const form = new FormData();
        form.set("resume", fileRef.current.files[0]);
        form.set("jd", jd);
        res = await fetch("/api/self-check", { method: "POST", body: form });
      } else {
        res = await fetch("/api/self-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resumeText, jd }),
        });
      }
      const body = (await res.json()) as SelfCheckResult & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Something went wrong — please try again.");
      } else {
        setResult(body);
      }
    } catch {
      setError("Network hiccup — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const b = result && result.mode === "llm" ? band(result.overall) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hl-warn)]">
          Free · No signup
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Score my resume</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--hl-mist)]">
          Get an instant, evidence-backed score against the job you're targeting — from the same
          screening engine recruiters use. Your resume never leaves this request: nothing is stored,
          no account needed.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1 · Your resume</CardTitle>
          <CardDescription>
            Upload a PDF/DOCX/TXT file or paste the full text. Max 10 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="block w-full cursor-pointer rounded-lg border border-dashed border-[var(--hl-border)] bg-[var(--hl-card)] px-3 py-6 text-sm text-[var(--hl-cream)] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[var(--hl-accent)] file:px-3 file:py-1.5 file:font-medium file:text-[var(--hl-ink)]"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFileName(f ? f.name : null);
              if (f) setResumeText("");
            }}
          />
          <textarea
            aria-label="Resume text"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder={
              fileName ? `Using uploaded file: ${fileName}` : "…or paste your resume text here"
            }
            rows={6}
            disabled={!!fileName}
            className="w-full rounded-lg border border-[var(--hl-border)] bg-[var(--hl-input)] p-3 text-sm text-[var(--hl-cream)] placeholder:text-[var(--hl-muted)] focus:border-[var(--hl-accent)] focus:outline-none"
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>2 · The job description</CardTitle>
          <CardDescription>
            Paste the posting you're targeting — the score is computed against it, exactly like a
            recruiter would.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            aria-label="Job description"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job description here…"
            rows={6}
            className="w-full rounded-lg border border-[var(--hl-border)] bg-[var(--hl-input)] p-3 text-sm text-[var(--hl-cream)] placeholder:text-[var(--hl-muted)] focus:border-[var(--hl-accent)] focus:outline-none"
          />
          <button
            type="button"
            className="text-xs text-[var(--hl-mist)] underline underline-offset-2 hover:text-foreground"
            onClick={() => setJd(SAMPLE_JD)}
          >
            Use a sample job description
          </button>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-center">
        <Button
          size="lg"
          onClick={submit}
          disabled={busy || (!resumeText.trim() && !fileName) || jd.trim().length < 40}
        >
          {busy ? "Scoring…" : "Score my resume"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-[var(--hl-bad)]/40 bg-[var(--hl-bad)]/10 p-3 text-center text-sm text-[var(--hl-bad)]"
        >
          {error}
        </p>
      )}

      {result && b && result.mode === "llm" && result.criteria && (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <CardDescription>Your score against this job</CardDescription>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold tracking-tight text-[var(--hl-warn)]">
                {result.overall}
              </span>
              <span className="text-lg text-[var(--hl-mist)]">/100</span>
            </div>
            <p className={`text-sm font-medium ${b.tone}`}>{b.label}</p>
            {result.derivedBy === "generic" && (
              <p className="text-xs text-[var(--hl-mist)]">
                Scored with a generic rubric (the server's AI rubric-derivation wasn't available
                right now).
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {result.criteria.map((c) => (
              <div key={c.key} className="rounded-lg border border-[var(--hl-border)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.title}</p>
                  <span className="text-sm text-[var(--hl-mist)]">{c.score} / 5</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--hl-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--hl-accent)]"
                    style={{ width: `${(c.score / 5) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--hl-mist)]">{c.rationale}</p>
                {c.evidence[0] && (
                  <p className="mt-2 border-l-2 border-[var(--hl-accent)]/60 pl-3 text-sm italic text-[var(--hl-mist)]">
                    “{c.evidence[0].quotedText}”
                  </p>
                )}
              </div>
            ))}
            <p className="text-center text-xs text-[var(--hl-mist)]">
              One score per criterion on an anchored 0–5 scale, combined into the overall. This is a
              signal to improve your resume — not a verdict.
            </p>
          </CardContent>
        </Card>
      )}

      {result?.skills && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Skill match for this job</CardTitle>
            <CardDescription>Deterministic check — no AI judgment in this part.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {typeof result.matchPct === "number" && (
              <div className="flex items-center gap-4">
                <p
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 text-lg font-bold"
                  style={{ borderColor: "var(--hl-accent)", color: "var(--hl-accent)" }}
                >
                  <span className="sr-only">Skill match: </span>
                  {result.matchPct}%
                </p>
                <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
                  of the skills this job names are covered — matched count fully, related strengths
                  count half. Every point traces to the chips below.
                </p>
              </div>
            )}
            <SkillSection
              label="What the job asked for that your resume shows"
              items={result.skills.matched}
              border="rgba(16,185,129,0.45)"
              bg="rgba(16,185,129,0.08)"
              fg="rgb(52,211,153)"
            />
            <SkillSection
              label="Related strengths you bring beyond the ask"
              items={result.skills.adjacent}
              border="border-[var(--hl-border)]"
              bg="rgba(148,163,184,0.08)"
              fg="rgb(203,213,225)"
            />
            <SkillSection
              label="What the job mentions that your resume doesn't"
              items={result.skills.missing}
              border="rgba(249,115,22,0.45)"
              bg="rgba(249,115,22,0.08)"
              fg="rgb(251,146,60)"
            />
          </CardContent>
        </Card>
      )}

      {result?.improve && result.improve.length > 0 && (
        <div className="mt-4">
          <ImproveCard
            steps={result.improve}
            onDownload={() => {
              const planSteps = result.improve ?? [];
              // A portable copy of the plan — plain Markdown, generated
              // client-side, nothing sent anywhere.
              const lines = [
                "# My HireLens improvement plan",
                "",
                `Generated ${new Date().toLocaleDateString()} via hirelens-rosy.vercel.app/self-check`,
                "",
                "## Steps, weakest area first",
                ...planSteps.map((s, i) => `${i + 1}. ${s}`),
                "",
                result?.skills
                  ? `## Skills vs this job\n\n- Matched: ${result.skills.matched.join(", ") || "—"}\n- Also strong at: ${result.skills.adjacent.join(", ") || "—"}\n- Missing (learn or name explicitly): ${result.skills.missing.join(", ") || "—"}`
                  : "",
              ].filter(Boolean);
              const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "hirelens-improvement-plan.md";
              a.click();
              URL.revokeObjectURL(url);
            }}
          />
        </div>
      )}

      {/* Score against another job — compare 2–3 target roles in one
          session without losing your resume. */}
      {result ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setJd("");
              setResult(null);
              setError(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="text-sm underline underline-offset-2"
            style={{ color: "var(--hl-mist)" }}
          >
            Score against another job →
          </button>
        </div>
      ) : null}

      {result && result.mode === "approximate" && (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <CardDescription>
              Approximate keyword check — the AI engine is busy right now. Retry in a few minutes
              for the full evidence-linked score.
            </CardDescription>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold tracking-tight text-[var(--hl-warn)]">
                {result.overall}%
              </span>
            </div>
            <p className="text-sm text-[var(--hl-mist)]">
              of the job description's key terms appear in your resume
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap justify-center gap-2">
              {result.keywords?.map((k) => (
                <span
                  key={k.word}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    k.found
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                      : "border-[var(--hl-bad)]/40 bg-[var(--hl-bad)]/10 text-[var(--hl-bad)]"
                  }`}
                >
                  {k.found ? "✓ " : "✗ "}
                  {k.word}
                </span>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-[var(--hl-mist)]">
              Recruiters' screening systems check exactly these terms — mirror the job's vocabulary
              and re-check.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-center text-sm text-[var(--hl-mist)]">
        Hiring instead of applying?{" "}
        <Link href="/demo" className="text-[var(--hl-warn)] underline underline-offset-2">
          See how recruiters screen with HireLens
        </Link>
      </p>
    </main>
  );
}
