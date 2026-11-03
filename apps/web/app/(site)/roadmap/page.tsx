import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Roadmap — HireLens",
  description: "What's shipped, what's on main since v1.4.0, and what comes next.",
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
  "Eval harness: direction accuracy, self-consistency, position bias, name-swap bias — with a published real-model run on /evaluation",
  "Public REST API with a live OpenAPI 3.1 contract; zero-dependency CLI",
  "One-command self-host via Docker Compose; local Ollama mode",
  "This premium site with a live no-signup demo running the real engine",
];

const SHIPPED_V11 = [
  "Candidate report — recruiters share an evidence-backed, read-only score report with each candidate via a once-only token link (create → view → read-counted → revocable)",
  "Score my resume — free public tool: candidates score their resume against any job description with the same rubric engine, evidence quotes included",
  "For-candidates hub — what transparent screening means for you, and control over your demographics data",
];

const SHIPPED_V12 = [
  "Skill-graph adjacency — every candidate page now shows matched / adjacent / missing skills computed deterministically from the parsed resume against skills extracted from the job description (no extra LLM cost)",
];

const SHIPPED_V14 = [
  "Talent-pool rediscovery — one org-wide search across every candidate from every job: identity search, skill facet chips, stage filter, rubric-weighted minimum score; shortlisting records a regular, audited decision. Blind review honored",
  "Public parser API — POST /api/public/parse: stateless resume → JSON-Resume-compatible profile with a Bearer org API token (file or text), SHA-256 content hash, per-token rate limiting; nothing stored",
  "ATS format check — deterministic parse simulation (pass/warn/fail, 0–100, actionable findings) on every upload: scanned pages, table/multi-column layouts, mojibake, missing sections — before a scoring run is spent on a mangled resume",
  "Application tracker for candidates — role, company, status, notes and self-check score, stored on the device only, exportable as CSV",
];

const SINCE_V14 = [
  "Resume Doctor — deterministic resume checks with a 0–100 score and every flag pinned to the exact line; paste text or upload a PDF or Word file",
  "Multi-provider AI — failover chain across providers, retry on overload, per-organization provider choice",
  "Talent pool “add to job” and parser hardening for compact resumes",
  "Security hardening — org-scoped link revocation and analytics, SSRF-safe ATS webhook fetch, strict production auth secret, Next.js 16.4.3",
];

const NEXT = [
  {
    title: "Now — hardening and the rename",
    items: [
      "Finishing the fixes from the October 2026 audit (the security fixes are merged)",
      "Rename to CandidLens, with a new logo and a free candidlens.vercel.app address",
      "Repository guardrails: dependency alerts, private vulnerability reporting, PR title checks",
      "Launch posts (Product Hunt, Show HN) once the new name is in place",
    ],
  },
  {
    title: "Next — trust and scale",
    items: [
      "Prompt-injection defence and per-score provenance",
      "An exact test and an “insufficient data” state for small bias-audit groups",
      "A durable queue for scoring runs and row-level security across tenants",
    ],
  },
];

const LATER = [
  {
    version: "v1.5.0 — next release",
    text: "Resume Doctor and everything above that is on main since v1.4.0",
  },
  { version: "2027", text: "i18n, SSO/SAML, advanced RBAC" },
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
        {SHIPPED_V11.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {SHIPPED_V12.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {SHIPPED_V14.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>On main since v1.4.0</h2>
      <ul>
        {SINCE_V14.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>What we are working on</h2>
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

      <h2>Releases</h2>
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
        Follow along issue-by-issue in the{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/milestones">GitHub milestones</a>.
      </p>
    </ProsePage>
  );
}
