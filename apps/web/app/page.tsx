"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthForm } from "@/components/auth-form";
import { useSession } from "@/lib/auth-client";
import evalReport from "../../../packages/eval-report.json";

const PIPELINE = [
  { step: "1", title: "Job description", text: "Paste the JD — that is the contract." },
  { step: "2", title: "Rubric", text: "LLM proposes criteria; six anchored levels each." },
  { step: "3", title: "Resumes", text: "Upload. Deduped, hashed, parsed locally." },
  { step: "4", title: "Score", text: "Per-criterion scores with quoted evidence spans." },
  { step: "5", title: "Audit", text: "Hash-chained log + adverse-impact reporting." },
];

const COMPARISON: Array<{ feature: string; hirelens: string; incumbents: string }> = [
  {
    feature: "Why the score?",
    hirelens: "Quoted evidence at exact character offsets",
    incumbents: "A number and a black box",
  },
  {
    feature: "Rubric control",
    hirelens: "Versioned, forkable, editable rubrics",
    incumbents: "Hidden vendor weights",
  },
  {
    feature: "Bias auditing",
    hirelens: "Four-fifths rule, one click, self-reported data",
    incumbents: "Marketing page only",
  },
  {
    feature: "Audit trail",
    hirelens: "Tamper-evident hash chain",
    incumbents: "None or export-only",
  },
  {
    feature: "Self-hosting",
    hirelens: "docker compose up — your data stays yours",
    incumbents: "SaaS-only",
  },
  { feature: "Source", hirelens: "MIT, open source", incumbents: "Proprietary" },
  { feature: "Cost", hirelens: "Your own LLM key", incumbents: "Per-seat + per-resume fees" },
];

const EVAL_ROWS: Array<{ label: string; value: string; note: string }> = [
  {
    label: "Direction accuracy",
    value: `${Math.round((evalReport.accuracy.accuracy ?? 0) * 100)}%`,
    note: "agreement with expected strong/weak per criterion",
  },
  {
    label: "Self-consistency",
    value: `${evalReport.selfConsistency.meanStdev ?? 0}σ`,
    note: "score variance across repeated runs (0 = deterministic)",
  },
  {
    label: "Position bias",
    value: `τ ${evalReport.positionBias.meanTau ?? 0}`,
    note: "Kendall τ between rank orderings of shuffled inputs",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session) router.replace("/jobs");
  }, [isPending, session, router]);

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur"
        style={{
          borderColor: "var(--color-border-subtle)",
          background: "color-mix(in oklab, var(--color-surface) 85%, transparent)",
        }}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <span className="font-semibold tracking-tight">HireLens</span>
          <nav className="ml-auto flex items-center gap-5 text-sm">
            <Link href="/demo" className="font-medium hover:opacity-80">
              Live demo
            </Link>
            <Link href="https://github.com/abhay-yemekar/hirelens" className="hover:opacity-80">
              GitHub
            </Link>
            <Link
              href="https://github.com/abhay-yemekar/hirelens/blob/main/docs/project_execution.md"
              className="hover:opacity-80"
            >
              Docs
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-20 text-center">
        <p
          className="mx-auto inline-block rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-fg-muted)" }}
        >
          Open source · MIT · self-hostable
        </p>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          AI resume screening that shows its work.
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-base leading-7"
          style={{ color: "var(--color-fg-muted)" }}
        >
          HireLens scores candidates against a rubric you control, quotes the exact resume text
          behind every point, keeps a tamper-evident audit trail, and measures adverse impact — no
          black box, no hidden weights.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/demo"
            className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Try the live demo — no signup
          </Link>
          <Link
            href="https://github.com/abhay-yemekar/hirelens"
            className="rounded-lg border px-6 py-3 text-sm font-semibold hover:opacity-80"
            style={{ borderColor: "var(--color-border-subtle)" }}
          >
            View on GitHub
          </Link>
        </div>
      </section>

      {/* Pipeline */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 className="text-center text-xl font-semibold tracking-tight">
          From JD to audit, in five steps
        </h2>
        <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE.map((p, i) => (
            <li
              key={p.step}
              className="demo-step rounded-lg border p-4"
              style={{ borderColor: "var(--color-border-subtle)", animationDelay: `${i * 120}ms` }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                {p.step}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
                {p.text}
              </p>
            </li>
          ))}
        </ol>
        <style jsx>{`
          .demo-step {
            opacity: 0;
            transform: translateY(8px);
            animation: demo-rise 400ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
          }
          @keyframes demo-rise {
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .demo-step { opacity: 1; transform: none; animation: none; }
          }
        `}</style>
      </section>

      {/* Eval numbers */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div
          className="rounded-xl border p-6"
          style={{
            borderColor: "var(--color-border-subtle)",
            background: "var(--color-surface-raised)",
          }}
        >
          <h2 className="text-lg font-semibold tracking-tight">
            An evaluated ranker, not a promise
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            The scorer is measured on a seeded synthetic benchmark in CI. Current numbers
            (mock-model plumbing run).
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {EVAL_ROWS.map((row) => (
              <div key={row.label}>
                <dt
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  {row.label}
                </dt>
                <dd className="mt-1 text-2xl font-bold">{row.value}</dd>
                <dd className="mt-1 text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
                  {row.note}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <h2 className="text-xl font-semibold tracking-tight">Honest comparison</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  className="border-b p-3 text-left font-semibold"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  Feature
                </th>
                <th
                  className="border-b p-3 text-left font-semibold"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  HireLens
                </th>
                <th
                  className="border-b p-3 text-left font-semibold"
                  style={{ borderColor: "var(--color-border-subtle)" }}
                >
                  Typical incumbent
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature}>
                  <td
                    className="border-b p-3 font-medium"
                    style={{ borderColor: "var(--color-border-subtle)" }}
                  >
                    {row.feature}
                  </td>
                  <td
                    className="border-b p-3"
                    style={{ borderColor: "var(--color-border-subtle)", color: "var(--green-fg)" }}
                  >
                    {row.hirelens}
                  </td>
                  <td
                    className="border-b p-3"
                    style={{
                      borderColor: "var(--color-border-subtle)",
                      color: "var(--color-fg-muted)",
                    }}
                  >
                    {row.incumbents}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Self-host CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-10">
        <div
          className="rounded-xl border p-8 text-center"
          style={{
            borderColor: "var(--color-border-subtle)",
            background: "var(--color-surface-raised)",
          }}
        >
          <h2 className="text-xl font-semibold tracking-tight">
            Your data never has to leave your machine
          </h2>
          <p
            className="mx-auto mt-2 max-w-xl text-sm leading-6"
            style={{ color: "var(--color-fg-muted)" }}
          >
            One command brings up web, API, and Postgres. The only external calls are the LLM
            scoring requests to a provider you configure.
          </p>
          <pre
            className="mx-auto mt-6 max-w-md overflow-x-auto rounded-lg border p-4 text-left text-xs leading-6"
            style={{
              borderColor: "var(--color-border-subtle)",
              background: "var(--color-surface-sunken)",
            }}
          >
            {`git clone https://github.com/abhay-yemekar/hirelens
cd hirelens && docker compose up --build -d`}
          </pre>
          <Link
            href="/demo"
            className="mt-6 inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            See it first — run the demo
          </Link>
        </div>
      </section>

      {/* Sign in */}
      <section className="mx-auto w-full max-w-md px-4 py-14">
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--color-border-subtle)" }}
        >
          <h2 className="text-center text-lg font-semibold tracking-tight">
            Sign in to the product
          </h2>
          <p className="mt-1 text-center text-xs" style={{ color: "var(--color-fg-muted)" }}>
            Create an account, create an organization, and score your own resumes.
          </p>
          <div className="mt-5">{!isPending && !session && <AuthForm />}</div>
        </div>
      </section>

      <footer
        className="border-t py-8 text-center text-xs"
        style={{ borderColor: "var(--color-border-subtle)", color: "var(--color-fg-muted)" }}
      >
        HireLens — MIT licensed. An AI score is a screening aid, not a hiring decision.
      </footer>
    </main>
  );
}
