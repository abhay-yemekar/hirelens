import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Contact & Support — HireLens",
  description:
    "How to get help with HireLens: GitHub issues for bugs and features, SECURITY.md for private disclosure, and the maintainer behind the project.",
};

const CHANNELS = [
  {
    title: "Bug or feature request",
    body: "Open a GitHub issue. Bugs: exact command, full error text, OS + Node/pnpm/Docker versions. Feature requests: the problem you're solving, not just the solution you imagine.",
    cta: "Open an issue",
    href: "https://github.com/abhay-yemekar/hirelens/issues",
  },
  {
    title: "Security vulnerability",
    body: "Do not open a public issue. Follow the private disclosure process in SECURITY.md — you'll get a response and a coordinated fix timeline.",
    cta: "Security policy",
    href: "https://github.com/abhay-yemekar/hirelens/blob/main/SECURITY.md",
  },
  {
    title: "Questions & self-hosting help",
    body: "The troubleshooting page covers every real error hit during development, with fixes. The documentation hub covers quickstart, CLI, and self-hosting.",
    cta: "Troubleshooting →",
    href: "/troubleshooting",
    internal: true,
  },
] as const;

export default function ContactPage() {
  return (
    <ProsePage
      eyebrow="Support"
      title="Contact"
      lede="HireLens is maintained in the open. The fastest way to get help is a public GitHub issue — it's searchable, and the answer helps the next person too."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {CHANNELS.map((c) => (
          <div
            key={c.title}
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <h2
              style={{
                marginTop: 0,
                fontSize: "1.02rem",
                fontWeight: 600,
                color: "var(--hl-cream)",
              }}
            >
              {c.title}
            </h2>
            <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>{c.body}</p>
            <a
              href={c.href}
              style={{
                display: "inline-block",
                marginTop: "0.75rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--hl-accent)",
                textDecoration: "none",
              }}
            >
              {c.cta} →
            </a>
          </div>
        ))}
      </div>

      <h2>The maintainer</h2>
      <div
        className="rounded-2xl border p-6"
        style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
      >
        <p className="text-lg font-semibold" style={{ color: "var(--hl-cream)" }}>
          Abhay Yemekar
        </p>
        <p style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
          HireLens is created and maintained by Abhay Yemekar — design, architecture, and every
          commit happen in the open on GitHub.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
          <a
            href="https://www.linkedin.com/in/abhayyemekar/"
            className="rounded-lg border px-4 py-2 transition-colors hover:border-[var(--hl-mist)]"
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
          >
            LinkedIn ↗
          </a>
          <a
            href="https://github.com/abhay-yemekar"
            className="rounded-lg border px-4 py-2 transition-colors hover:border-[var(--hl-mist)]"
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
          >
            GitHub ↗
          </a>
        </div>
      </div>

      <h2>The repository</h2>
      <p>Everything — source, docs, eval harness, this website — lives in one public repo:</p>
      <p>
        <a href="https://github.com/abhay-yemekar/hirelens">github.com/abhay-yemekar/hirelens</a> ·
        MIT licensed ·{" "}
        <img
          src="https://img.shields.io/github/stars/abhay-yemekar/hirelens?style=social"
          alt="GitHub stars"
          width={90}
          height={20}
          style={{ display: "inline", verticalAlign: "middle" }}
        />
      </p>
    </ProsePage>
  );
}
