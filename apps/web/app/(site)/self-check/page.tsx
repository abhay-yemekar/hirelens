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
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

function ImproveCard({ steps }: { steps: string[] }) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">How to strengthen your application</CardTitle>
        <CardDescription>Actionable steps, weakest area first — never a verdict.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2 leading-6 text-muted-foreground">
              <span aria-hidden className="text-orange-400">
                →
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
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
  return { label: "Emerging match — focus on the flagged criteria", tone: "text-orange-400" };
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
          Free · No signup
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Score my resume</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
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
            className="block w-full cursor-pointer rounded-lg border border-dashed border-border bg-card px-3 py-6 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-white"
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
            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
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
            className="w-full rounded-lg border border-border bg-background p-3 text-sm"
          />
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
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
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-center text-sm text-red-400"
        >
          {error}
        </p>
      )}

      {result && b && result.mode === "llm" && result.criteria && (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <CardDescription>Your score against this job</CardDescription>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold tracking-tight text-orange-400">
                {result.overall}
              </span>
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <p className={`text-sm font-medium ${b.tone}`}>{b.label}</p>
            {result.derivedBy === "generic" && (
              <p className="text-xs text-muted-foreground">
                Scored with a generic rubric (the server's AI rubric-derivation wasn't available
                right now).
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {result.criteria.map((c) => (
              <div key={c.key} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.title}</p>
                  <span className="text-sm text-muted-foreground">{c.score} / 5</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${(c.score / 5) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c.rationale}</p>
                {c.evidence[0] && (
                  <p className="mt-2 border-l-2 border-orange-500/60 pl-3 text-sm italic text-muted-foreground">
                    “{c.evidence[0].quotedText}”
                  </p>
                )}
              </div>
            ))}
            <p className="text-center text-xs text-muted-foreground">
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
              border="border-border"
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
          <ImproveCard steps={result.improve} />
        </div>
      )}

      {result && result.mode === "approximate" && (
        <Card className="mt-8">
          <CardHeader className="items-center text-center">
            <CardDescription>
              Approximate keyword check — the AI engine is busy right now. Retry in a few minutes
              for the full evidence-linked score.
            </CardDescription>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold tracking-tight text-orange-400">
                {result.overall}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
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
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }`}
                >
                  {k.found ? "✓ " : "✗ "}
                  {k.word}
                </span>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Recruiters' screening systems check exactly these terms — mirror the job's vocabulary
              and re-check.
            </p>
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Hiring instead of applying?{" "}
        <Link href="/demo" className="text-orange-400 underline underline-offset-2">
          See how recruiters screen with HireLens
        </Link>
      </p>
    </main>
  );
}
