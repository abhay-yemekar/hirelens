import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation — HireLens",
  description:
    "HireLens documentation: quickstart, CLI reference, self-hosting guide, blind review methodology, API reference, and troubleshooting.",
};

const SECTIONS = [
  {
    title: "Get started",
    pages: [
      {
        href: "/docs/quickstart",
        title: "Quickstart",
        text: "Clean machine → first scored candidate. Every command with expected output.",
      },
      {
        href: "/docs/self-hosting",
        title: "Self-hosting",
        text: "One command brings up web, API, and Postgres. Env vars, backups, upgrades.",
      },
      {
        href: "/docs/cli",
        title: "CLI reference",
        text: "The whole pipeline from a terminal: login, jobs, rubric derive, score.",
      },
    ],
  },
  {
    title: "Understand",
    pages: [
      {
        href: "/docs/blind-review-and-bias-audits",
        title: "Blind review & bias audits",
        text: "The methodology — what gets masked, how the four-fifths rule is applied, what we deliberately don't do.",
      },
      {
        href: "/evaluation",
        title: "Evaluation harness",
        text: "Direction accuracy, self-consistency, position bias, name-swap bias — with current numbers.",
      },
      {
        href: "/api-reference",
        title: "API reference",
        text: "The authenticated, org-scoped REST surface and its OpenAPI 3.1 contract.",
      },
    ],
  },
  {
    title: "Operate",
    pages: [
      {
        href: "/troubleshooting",
        title: "Troubleshooting",
        text: "Real errors from development, with fixes. If this guide is wrong, that's a bug.",
      },
      {
        href: "/roadmap",
        title: "Roadmap",
        text: "What's shipped, what's next, and how versioning works.",
      },
    ],
  },
];

export default function DocsHubPage() {
  return (
    <main className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(700px 300px at 50% -10%, rgba(255,107,87,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-4xl px-4 pb-24 pt-16">
        <header>
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--hl-accent)" }}
          >
            Documentation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need to run HireLens.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--hl-mist)" }}>
            The guides below are rendered right here — no repository detour. The full source of each
            lives in the{" "}
            <a
              className="underline"
              style={{ color: "var(--hl-accent)" }}
              href="https://github.com/abhay-yemekar/hirelens"
            >
              public repo
            </a>{" "}
            if you want to go deeper.
          </p>
        </header>

        <div className="mt-12 flex flex-col gap-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--hl-muted)" }}
              >
                {section.title}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.pages.map((page) => (
                  <Link
                    key={page.href}
                    href={page.href}
                    className="rounded-2xl border p-5 transition-transform hover:-translate-y-0.5"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
                  >
                    <p className="text-[15px] font-semibold" style={{ color: "var(--hl-cream)" }}>
                      {page.title}
                    </p>
                    <p className="mt-2 text-[13px] leading-5" style={{ color: "var(--hl-mist)" }}>
                      {page.text}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
