import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Roadmap — HireLens",
  description:
    "What's shipped, what's between here and v1.0.0 (30 September 2026), and the post-launch version plan.",
};

const NOW = [
  "Full scoring engine: rubric → per-criterion scores with quoted evidence spans at exact offsets",
  "Review workflow: ranked queue, required-reason decisions, blind review, score overrides",
  "Adverse-impact bias audit with the four-fifths rule and opt-in self-reported demographics",
  "Tamper-evident hash-chained audit log of every run, override, and decision",
  "Semantic search & ask over resumes (pgvector) with server-verified citations",
  "Rubric editor: criteria, weights, anchored scales, versions, AI draft",
  "Interview kits: printable debrief packs with probes, anchors, and the evidence behind every score",
  "Candidate portal: one-shot opt-in demographics self-report links",
  "Team seats: invite, roles (owner / recruiter / hiring manager / viewer), pending-invite management",
  "Shareable scored reports (public read-only link, instant revoke, view counts) + hash-chain-verified audit CSV export",
  "Compare view: 2–3 candidates side-by-side on one scoring run",
  "Eval harness: direction accuracy, self-consistency, position bias, name-swap bias — in CI",
  "Public REST API with a live OpenAPI 3.1 contract; zero-dependency CLI",
  "One-command self-host via Docker Compose; local Ollama mode",
  "This premium site with a live no-signup demo running the real engine",
];

const NEXT = [
  {
    title: "Hardening — before v1.0",
    items: [
      "Deeper input validation and rate limiting beyond the demo endpoint",
      "Accessibility pass against WCAG 2.2 AA across the product UI",
      "Load test a 200-resume batch end to end",
      "Lighthouse ≥ 95 on performance, a11y, best practices, SEO",
    ],
  },
  {
    title: "Private beta",
    items: [
      "5–10 real recruiters screen a real job with HireLens",
      "Fix what they actually hit — not what we guess they will",
      "Feature freeze; polish only",
    ],
  },
  {
    title: "Launch — v1.0.0, 30 September 2026",
    items: [
      "Tag v1.0.0 + GitHub Release generated from Conventional Commits",
      "Multi-arch container images on GHCR (amd64 + arm64)",
      "npx hirelens on npm",
      "10+ stocked good-first-issues for new contributors",
    ],
  },
];

const LATER = [
  {
    version: "v1.1 — Nov 2026",
    text: "Skill-graph adjacency, richer analytics dashboards, scheduled audits, AI-content detection",
  },
  {
    version: "v1.2 — Jan 2027",
    text: "ATS integrations (Greenhouse, Lever, Ashby), rubric marketplace UI, e-sign decision records",
  },
  { version: "v1.3 — Mar 2027", text: "i18n, SSO/SAML, advanced RBAC" },
  {
    version: "v1.5 — 2027",
    text: "Candidate mode — score my resume against this JD, reusing the identical rubric engine",
  },
  {
    version: "v2.0",
    text: "Plugin architecture, Helm chart for self-hosters, fine-tuned open scoring model",
  },
];

export default function RoadmapPage() {
  return (
    <ProsePage
      eyebrow="Project"
      title="Roadmap"
      lede="Scope is fixed and the cut list is real: a smaller product that is beautiful, tested, and honest beats a large one that is half-wired."
    >
      <h2>Shipped — on main today</h2>
      <ul>
        {NOW.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>Between here and launch</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {NEXT.map((phase) => (
          <div
            key={phase.title}
            className="rounded-2xl border p-5"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-card)" }}
          >
            <h3 style={{ marginTop: 0 }}>{phase.title}</h3>
            <ul style={{ marginTop: "0.5rem" }}>
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2>After launch</h2>
      <table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Theme</th>
          </tr>
        </thead>
        <tbody>
          {LATER.map((row) => (
            <tr key={row.version}>
              <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{row.version}</td>
              <td>{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Follow along issue-by-issue on{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/issues">GitHub</a>.
      </p>
    </ProsePage>
  );
}
