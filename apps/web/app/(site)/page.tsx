import type { Metadata } from "next";
import Link from "next/link";
import { BiasAuditShot, EvidenceShot, RankedQueueShot } from "@/components/product-shots";
import evalReport from "../../../../packages/eval-report.json";

export const metadata: Metadata = {
  title: "HireLens — AI screening that shows its work",
  description:
    "Open-source, glass-box resume screening: evidence-linked scores, rubrics you control, tamper-evident audit trails, and one-click adverse-impact audits. Self-host with one command.",
  openGraph: {
    title: "HireLens — AI screening that shows its work",
    description:
      "Evidence-linked resume scoring, bias audits, and a tamper-evident decision trail. MIT, self-hostable, model-agnostic.",
    type: "website",
    url: "https://github.com/abhay-yemekar/hirelens",
  },
};

const PROVIDERS = ["Google Gemini", "Anthropic", "Groq", "OpenRouter", "Ollama (local)"];

const FEATURES = [
  {
    title: "Evidence-linked scoring",
    text: "Every criterion score quotes the exact resume text that produced it — at its character offset. Click a score and the resume highlights the line. No naked numbers, ever.",
    span: "lg:col-span-2",
    shot: "evidence" as const,
  },
  {
    title: "Rubrics you control",
    text: "The LLM proposes criteria from your JD; six anchored levels each, weights normalized. Fork, edit, version, import — the rubric is a JSON artifact you own.",
    span: "",
  },
  {
    title: "Blind review built in",
    text: "One toggle masks names, contacts, schools — with character alignment preserved so evidence spans still land exactly.",
    span: "",
  },
  {
    title: "Adverse-impact auditing",
    text: "One click computes selection rates by group, applies the EEOC four-fifths rule, and exports the report. Non-reporters are bucketed — silence is itself a finding.",
    span: "lg:col-span-2",
    shot: "audit" as const,
  },
  {
    title: "Tamper-evident audit trail",
    text: "Every decision, override, and report is appended to a hash chain. Tampering breaks the chain visibly.",
    span: "",
  },
  {
    title: "Your model, your data",
    text: "Bring a key for Gemini, Claude, Groq, or OpenRouter — or run fully local with Ollama. Resumes never have to leave your machine.",
    span: "",
  },
  {
    title: "Terminal-grade CLI",
    text: "score <jobId> ./resumes — the full pipeline from a terminal, with ranked output and JSON for automation. Zero runtime dependencies.",
    span: "",
  },
];

const PIPELINE = [
  {
    step: "01",
    title: "Paste the JD",
    text: "The job description is the contract. Nothing else configures the ranking.",
  },
  {
    step: "02",
    title: "Derive the rubric",
    text: "5–8 weighted criteria with anchored 0–5 levels. Review and edit before anything scores.",
  },
  {
    step: "03",
    title: "Drop in resumes",
    text: "PDF, DOCX, TXT, or a ZIP. Parsed, hashed, deduped — locally.",
  },
  {
    step: "04",
    title: "Score with evidence",
    text: "Per-criterion 0–5 with the exact quoted line behind every point.",
  },
  {
    step: "05",
    title: "Decide & audit",
    text: "Advance or reject with a required reason. One-click adverse-impact report.",
  },
];

const COMPARISON: Array<{ feature: string; hirelens: string; blackbox: string; ats: string }> = [
  {
    feature: "Why this score?",
    hirelens: "Quoted evidence at exact offsets",
    blackbox: "Opaque",
    ats: "—",
  },
  {
    feature: "Rubric control",
    hirelens: "Versioned JSON you own",
    blackbox: "Hidden weights",
    ats: "—",
  },
  {
    feature: "Bias auditing",
    hirelens: "Four-fifths rule, one click",
    blackbox: "Marketing page only",
    ats: "—",
  },
  {
    feature: "Decision trail",
    hirelens: "Hash-chained, tamper-evident",
    blackbox: "None",
    ats: "Basic logs",
  },
  { feature: "Self-host", hirelens: "docker compose up", blackbox: "SaaS only", ats: "Varies" },
  { feature: "License", hirelens: "MIT", blackbox: "Proprietary", ats: "Open core" },
];

const FAQ = [
  {
    q: "Is this another black-box AI screener?",
    a: "The opposite. HireLens refuses to output a score it cannot justify: every criterion score carries the quoted resume text and its character offset. If the model can't ground a score in the document, the score doesn't ship.",
  },
  {
    q: "Which LLMs does it support?",
    a: "Google Gemini, Anthropic, Groq, and OpenRouter with your own API key — or fully local inference with Ollama, in which case no resume ever leaves your machine. Providers that can't express complex rubric schemas natively (like Gemini's nested-array limits) are handled by an automatic validated fallback.",
  },
  {
    q: "How does the bias audit work?",
    a: "Candidates may self-report demographics, per dimension, opt-in only. The audit computes selection rates per group, applies the EEOC four-fifths (80%) rule with exact integer math (so 0.8 passes), and reports demographic parity difference. People who didn't report are bucketed as 'undisclosed' — because not knowing who you rejected is itself an audit finding. It's a statistical screen for further inquiry, not proof of discrimination.",
  },
  {
    q: "Does HireLens make hiring decisions?",
    a: "Never. It ranks, explains, and audits. Humans make every decision, and every decision requires a stated reason that lands in the tamper-evident audit log. An AI score is a screening aid, not a hiring decision.",
  },
  {
    q: "Can I self-host it?",
    a: "Yes — one command: docker compose up --build -d brings up the web app, API, and Postgres with migrations applied automatically. Point it at Ollama and nothing leaves your network.",
  },
  {
    q: "What's the license?",
    a: "MIT. Fork it, extend it, run it commercially — the rubrics, evidence, and audit logs are all plain JSON in your own Postgres.",
  },
];

export default function LandingPage() {
  const acc = Math.round((evalReport.accuracy?.accuracy ?? 0) * 100);
  const sigma = evalReport.selfConsistency?.meanStdev ?? 0;
  const tau = evalReport.positionBias?.meanTau ?? 0;

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 480px at 78% -10%, rgba(255,107,87,0.16), transparent 65%), radial-gradient(700px 420px at 12% 8%, rgba(120,140,255,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
          <div>
            <p
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--hl-good)" }} />
              Open source · MIT · self-hostable
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              AI screening that shows
              <br />
              its <span style={{ color: "var(--hl-accent)" }}>work.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7" style={{ color: "var(--hl-mist)" }}>
              HireLens scores candidates against a rubric you control, quotes the exact resume text
              behind every point, logs every decision to a tamper-evident chain, and audits itself
              for adverse impact. No black box. No hidden weights.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/demo"
                className="rounded-xl px-6 py-3.5 text-sm font-semibold text-[var(--hl-ink)] shadow-lg transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--hl-accent)",
                  boxShadow: "0 12px 32px -12px rgba(255,107,87,0.55)",
                }}
              >
                Score a resume — no signup
              </Link>
              <Link
                href="https://github.com/abhay-yemekar/hirelens"
                className="rounded-xl border px-6 py-3.5 text-sm font-semibold transition-colors hover:border-[var(--hl-mist)]"
                style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
              >
                Star on GitHub
              </Link>
            </div>
            <p className="mt-6 text-xs" style={{ color: "var(--hl-muted)" }}>
              Works with {PROVIDERS.join(" · ")}
            </p>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-8 -z-10 rounded-[32px]"
              style={{
                background:
                  "radial-gradient(600px 320px at 60% 30%, rgba(255,107,87,0.10), transparent 70%)",
              }}
            />
            <RankedQueueShot />
            <div className="absolute -bottom-10 -left-6 hidden w-[54%] sm:block lg:-left-16">
              <EvidenceShot />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature bento ────────────────────────────────────── */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-24">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--hl-accent)" }}
        >
          Why HireLens
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          A hiring AI with a paper trail.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--hl-mist)" }}>
          Screeners that can't explain themselves are a liability — to candidates, to recruiters,
          and under NYC LL144 and the EU AI Act. HireLens is built around one contract: every score
          must link to the exact evidence that produced it.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className={`rounded-2xl border p-6 ${f.span}`}
              style={{
                borderColor: "var(--hl-border)",
                background: "var(--hl-card)",
                display: "flex",
                flexDirection: "column",
                gap: "0.9rem",
              }}
            >
              <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
                {f.text}
              </p>
              {f.shot === "evidence" && <EvidenceShot />}
              {f.shot === "audit" && <BiasAuditShot />}
            </article>
          ))}
        </div>
      </section>

      {/* ── Pipeline ─────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="border-y"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--hl-accent)" }}
          >
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            JD in. Audited shortlist out.
          </h2>
          <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((p) => (
              <li
                key={p.step}
                className="rounded-2xl border p-5"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              >
                <span
                  className="text-xs font-bold tracking-widest"
                  style={{ color: "var(--hl-accent)" }}
                >
                  {p.step}
                </span>
                <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
                <p className="mt-2 text-[13px] leading-5" style={{ color: "var(--hl-mist)" }}>
                  {p.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Accuracy ─────────────────────────────────────────── */}
      <section id="accuracy" className="mx-auto w-full max-w-6xl px-4 py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--hl-accent)" }}
            >
              Accuracy
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              An evaluated ranker, not a promise.
            </h2>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--hl-mist)" }}>
              Every PR runs a seeded benchmark through the same engine the product uses. The numbers
              ship in the repo — and on this page. Currently the plumbing run against the offline
              mock model; regenerate live with your key.
            </p>
            <Link
              href="https://github.com/abhay-yemekar/hirelens/tree/main/packages/evals"
              className="mt-6 inline-block text-sm font-semibold"
              style={{ color: "var(--hl-accent)" }}
            >
              Read the harness source →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Direction accuracy",
                value: `${acc}%`,
                note: "agreement with expected strong/weak per criterion",
              },
              {
                label: "Self-consistency (σ)",
                value: `${sigma}σ`,
                note: "σ (sigma) = score wobble across identical reruns — 0 means the same resume always gets the same score",
              },
              {
                label: "Order fairness (τ)",
                value: `τ ${tau}`,
                note: "τ (tau) = rank agreement when resume order is shuffled — 1.0 means order never changes the ranking",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border p-5"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              >
                <p className="text-3xl font-bold tracking-tight">{m.value}</p>
                <p
                  className="mt-1 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--hl-accent)" }}
                >
                  {m.label}
                </p>
                <p className="mt-2 text-xs leading-5" style={{ color: "var(--hl-muted)" }}>
                  {m.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ───────────────────────────────────────── */}
      <section
        className="border-y"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-24">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The honest comparison
          </h2>
          <div
            className="mt-10 overflow-x-auto rounded-2xl border"
            style={{ borderColor: "var(--hl-border)" }}
            role="region"
            aria-label="Feature comparison table, scrollable horizontally"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG scrollable regions must be keyboard-focusable (axe-verified)
            tabIndex={0}
          >
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr style={{ color: "var(--hl-muted)" }}>
                  <th className="p-4 text-left font-medium">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th className="p-4 text-left font-semibold text-[var(--hl-cream)]">HireLens</th>
                  <th className="p-4 text-left font-medium">Black-box AI screeners</th>
                  <th className="p-4 text-left font-medium">Legacy ATS</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-t"
                    style={{ borderColor: "var(--hl-border)" }}
                  >
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 font-medium" style={{ color: "var(--hl-good)" }}>
                      {row.hirelens}
                    </td>
                    <td className="p-4" style={{ color: "var(--hl-muted)" }}>
                      {row.blackbox}
                    </td>
                    <td className="p-4" style={{ color: "var(--hl-muted)" }}>
                      {row.ats}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Self-host ────────────────────────────────────────── */}
      <section id="self-host" className="mx-auto w-full max-w-6xl px-4 py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--hl-accent)" }}
            >
              Self-host
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Resumes never have to leave your machine.
            </h2>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--hl-mist)" }}>
              One command stands up the full stack — web, API, Postgres — with migrations applied on
              boot. Point the LLM at Ollama and your candidate data never touches a third party.
              Everything lives in your own database, as plain JSON you can query.
            </p>
            <Link
              href="https://github.com/abhay-yemekar/hirelens/blob/main/apps/docs/content/docs/guides/self-hosting.mdx"
              className="mt-6 inline-block text-sm font-semibold"
              style={{ color: "var(--hl-accent)" }}
            >
              Self-hosting guide →
            </Link>
          </div>
          <div
            className="overflow-hidden rounded-2xl border"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
          >
            <div
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{ borderColor: "var(--hl-border)" }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
              <span className="ml-2 text-xs" style={{ color: "var(--hl-muted)" }}>
                terminal
              </span>
            </div>
            <pre
              className="overflow-x-auto p-5 text-[13px] leading-7"
              style={{ color: "var(--hl-cream)" }}
              role="region"
              aria-label="Install commands, scrollable horizontally"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG scrollable regions must be keyboard-focusable (axe-verified)
              tabIndex={0}
            >
              <code>
                <span style={{ color: "var(--hl-muted)" }}>$ </span>git clone
                https://github.com/abhay-yemekar/hirelens{"\n"}
                <span style={{ color: "var(--hl-muted)" }}>$ </span>cd hirelens && cp .env.example
                .env{"\n"}
                <span style={{ color: "var(--hl-muted)" }}>$ </span>docker compose up --build -d
                {"\n\n"}
                <span style={{ color: "var(--hl-good)" }}>
                  ✔ web :3000 · api :4000 · postgres :5433{"\n"}
                </span>
                <span style={{ color: "var(--hl-good)" }}>✔ migrations applied · ready in 40s</span>
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section
        id="faq"
        className="border-t"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-ink-2)" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered honestly
          </h2>
          <div className="mt-12 flex flex-col gap-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border px-5 py-4"
                style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
              >
                <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span
                      className="transition-transform group-open:rotate-45"
                      style={{ color: "var(--hl-accent)" }}
                      aria-hidden
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7" style={{ color: "var(--hl-mist)" }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 380px at 50% 120%, rgba(255,107,87,0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-3xl px-4 py-28 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            See the evidence before you trust the score.
          </h2>
          <p
            className="mx-auto mt-4 max-w-xl text-base leading-7"
            style={{ color: "var(--hl-mist)" }}
          >
            The live demo scores real synthetic resumes with the actual engine — evidence highlights
            included. No signup, no email, no drip campaign.
          </p>
          <Link
            href="/demo"
            className="mt-8 inline-block rounded-xl px-8 py-4 text-sm font-semibold text-[var(--hl-ink)] transition-transform hover:-translate-y-0.5"
            style={{
              background: "var(--hl-accent)",
              boxShadow: "0 12px 32px -12px rgba(255,107,87,0.55)",
            }}
          >
            Try the live demo
          </Link>
          <p id="roadmap" className="mt-10 text-xs" style={{ color: "var(--hl-muted)" }}>
            v1.0.0 targeted for 30 September 2026 — follow along on GitHub.
          </p>
        </div>
      </section>
    </main>
  );
}
