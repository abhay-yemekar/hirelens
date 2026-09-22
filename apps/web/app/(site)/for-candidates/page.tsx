import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For candidates — HireLens",
  description:
    "What transparent AI screening means for you: a free resume score against any job description, evidence-backed reports, and control over your demographics data.",
};

const PILLARS = [
  {
    title: "Score my resume — free",
    body: "Paste your resume and any job description. Get the same evidence-linked score recruiters see, with the exact resume text behind every point. No account, and nothing is stored — your resume never leaves the request.",
    cta: { href: "/self-check", label: "Score my resume" },
  },
  {
    title: "Your report, your evidence",
    body: "When a recruiter uses HireLens and shares your report, you get your own outcome — per-criterion scores, the quoted resume passages behind them, and what each level of the scale means. Not a silent reject: the actual reasoning.",
    cta: null,
  },
  {
    title: "Demographics is opt-in, always",
    body: "If a recruiter invites you to the bias-audit self-report, every field is optional and skippable, the page explains exactly where your answers go before you type anything, and the link works once — no account, no tracking.",
    cta: null,
  },
];

const FAQ = [
  {
    q: "Does an AI reject my resume?",
    a: "No. In HireLens the AI only drafts a score against a rubric — a human recruiter reviews every candidate and makes the actual decision, and their overrides are logged too. A low score is a signal to improve specific things, not an automatic rejection.",
  },
  {
    q: "What does the score actually mean?",
    a: "Each criterion (skills, experience, impact…) is scored 0–5 against a written scale — level 3 always means the same thing, regardless of model mood. Weighted criteria combine into an overall 0–100. Every point cites the resume text it came from.",
  },
  {
    q: "What happens to my resume when I use the free checker?",
    a: "Nothing is stored: the text lives in your request, the score comes back, and both are discarded. There is no account and no email capture. Self-hosted instances keep this property by design.",
  },
  {
    q: "Can I see why a company rejected me?",
    a: "If the recruiter shares your HireLens report (increasingly common with HireLens users), you'll see your own evidence-backed result. Ask them — the feature exists so screening can be explained to you.",
  },
];

export default function ForCandidatesPage() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 420px at 20% -10%, rgba(255,107,87,0.14), transparent 65%), radial-gradient(700px 400px at 85% 10%, rgba(120,140,255,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-16 text-center lg:pt-24">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--hl-accent)" }} />
            For job seekers
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            Screening should explain itself —{" "}
            <span style={{ color: "var(--hl-accent)" }}>to you too.</span>
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-7"
            style={{ color: "var(--hl-mist)" }}
          >
            Most AI screeners judge your resume and stay silent. HireLens is built glass-box on both
            sides: score your resume for free, and if a recruiter shares your report, read the exact
            evidence behind your result.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/self-check"
              className="rounded-xl px-6 py-3.5 text-sm font-semibold text-[var(--hl-ink)] shadow-lg transition-transform hover:-translate-y-0.5"
              style={{
                background: "var(--hl-accent)",
                boxShadow: "0 12px 32px -12px rgba(255,107,87,0.55)",
              }}
            >
              Score my resume — free
            </Link>
            <Link
              href="/demo"
              className="rounded-xl border px-6 py-3.5 text-sm font-semibold transition-colors hover:border-[var(--hl-mist)]"
              style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
            >
              See the recruiter side
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border p-6"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
            >
              <h2 className="text-lg font-semibold" style={{ color: "var(--hl-cream)" }}>
                {p.title}
              </h2>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
                {p.body}
              </p>
              {p.cta && (
                <Link
                  href={p.cta.href}
                  className="mt-4 inline-block text-sm font-semibold underline underline-offset-4"
                  style={{ color: "var(--hl-accent)" }}
                >
                  {p.cta.label} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--hl-cream)" }}>
          Straight answers
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="rounded-xl border px-5 py-4"
              style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
            >
              <summary
                className="cursor-pointer text-sm font-medium"
                style={{ color: "var(--hl-cream)" }}
              >
                {f.q}
              </summary>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
