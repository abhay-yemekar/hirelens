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
  "Candidates table: server-side pagination (25/page) and identity search across name, email, and phone",
  "Shareable scored reports (public read-only link, instant revoke, view counts) + hash-chain-verified audit CSV export",
  "Compare view: 2–3 candidates side-by-side on one scoring run",
  "Eval harness: direction accuracy, self-consistency, position bias, name-swap bias — in CI",
  "Public REST API with a live OpenAPI 3.1 contract; zero-dependency CLI",
  "One-command self-host via Docker Compose; local Ollama mode",
  "This premium site with a live no-signup demo running the real engine",
];

const SHIPPED_V12 = [
  "Skill-graph adjacency — every candidate page now shows matched / adjacent / missing skills computed deterministically from the parsed resume against skills extracted from the job description (no extra LLM cost)",
];

const NEXT = [
  {
    title: "In progress — launch window (Sept–Oct 2026)",
    items: [
      "v1.0.0 tagged with GitHub Release, CHANGELOG, and GHCR images (done)",
      "npx hirelens CLI published on npm (done)",
      "Private beta with real recruiters — feedback drives the polish list",
      "Launch posts: Product Hunt and Show HN (drafted in docs/launch-kit.md)",
    ],
  },
  {
    title: "Shipped — v1.1: the candidate side, at equal level",
    items: [
      "Candidate report — recruiters share an evidence-backed, read-only score report with each candidate via a once-only token link (create → view → read-counted → revocable)",
      "Score my resume — free public tool: candidates score their resume against any job description with the same rubric engine, evidence quotes included",
      "For-candidates hub — what transparent screening means for you, and control over your demographics data",
    ],
  },
];

const LATER = [
  {
    version: "v1.2 — mostly shipped",
    text: "✅ skill-graph adjacency · ✅ org analytics dashboard · ✅ scheduled audits (cron snapshots + trend) · ✅ deterministic writing-style signals. Remaining: ATS integrations via our public API + webhooks (partner-by-API rather than one-off connectors), rubric marketplace UI",
  },
  { version: "v1.3 — Mar 2027", text: "i18n, SSO/SAML, advanced RBAC" },
  {
    version: "v1.5 — 2027",
    text: "Candidate application tracker — candidates organize applications and see which of their skills matched each role",
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
        {SHIPPED_V12.map((item) => (
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
