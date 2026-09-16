import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "API reference — HireLens",
  description:
    "The HireLens REST API: authenticated, org-scoped endpoints for jobs, rubrics, candidates, scoring runs, review, and bias audits. Live OpenAPI 3.1 contract.",
};

const ROUTES: Array<{ method: string; path: string; desc: string }> = [
  { method: "GET", path: "/api/health", desc: "Public health check" },
  { method: "POST", path: "/api/auth/sign-up/email", desc: "Register (Better Auth)" },
  { method: "POST", path: "/api/auth/sign-in/email", desc: "Log in" },
  { method: "GET|POST|PATCH", path: "/api/jobs", desc: "Jobs CRUD (org-scoped)" },
  { method: "GET|POST", path: "/api/jobs/:id/rubrics", desc: "Rubric versions" },
  { method: "POST", path: "/api/jobs/:id/rubrics/derive", desc: "LLM JD → criteria" },
  { method: "POST", path: "/api/jobs/:id/candidates", desc: "Upload a resume (PDF/DOCX/TXT/MD)" },
  { method: "POST", path: "/api/jobs/:id/candidates/zip", desc: "Batch-upload a ZIP of resumes" },
  {
    method: "POST",
    path: "/api/jobs/:id/score",
    desc: "Score all candidates (concurrency-bounded, audited)",
  },
  { method: "GET", path: "/api/jobs/:id/runs", desc: "Scoring run history" },
  {
    method: "GET",
    path: "/api/jobs/:id/runs/:runId",
    desc: "Run detail: per-candidate scores + evidence spans",
  },
  {
    method: "GET",
    path: "/api/jobs/:id/candidates",
    desc: "Candidate list (metadata only — no resume text)",
  },
  {
    method: "GET",
    path: "/api/jobs/:id/candidates/:cid",
    desc: "Candidate detail: parsed profile, document text, decisions",
  },
  {
    method: "GET",
    path: "/api/jobs/:id/review",
    desc: "Ranked review table: latest overall per candidate + stage",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/decisions",
    desc: "Record a decision (stage + required reason; audit-chained)",
  },
  {
    method: "PATCH",
    path: "/api/jobs/:id/scores/:scoreId",
    desc: "Manual score override (author + reason recorded)",
  },
  {
    method: "PUT",
    path: "/api/jobs/:id/demographics/:cid",
    desc: "Candidate's opt-in demographics self-report",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/bias-audit",
    desc: "Adverse-impact report (four-fifths rule; audited)",
  },
  { method: "GET", path: "/api/openapi.json", desc: "The live OpenAPI 3.1 contract" },
];

export default function ApiReferencePage() {
  return (
    <ProsePage
      eyebrow="Docs · Understand"
      title="API reference"
      lede="Authenticated, organization-scoped REST. Every mounted route is described by a live OpenAPI 3.1 document, and a CI test fails if a route ships without a spec entry."
    >
      <h2>Authentication</h2>
      <p>
        Better Auth issues an HTTP-only session cookie on sign-in. Browser clients just work
        (same-origin or CORS-enabled); non-browser clients pass the session cookie with each
        request. Sign-up requires an <code>Origin</code> header matching a trusted origin — a
        deliberate CSRF guard.
      </p>
      <pre>
        <code>{`curl -X POST http://localhost:4000/api/auth/sign-in/email \\
  -H "content-type: application/json" \\
  -H "Origin: http://localhost:3000" \\
  -d '{"email":"you@example.com","password":"..."}' -c cookies.txt

curl http://localhost:4000/api/jobs -b cookies.txt`}</code>
      </pre>

      <h2>The contract</h2>
      <p>
        Fetch <code>GET /api/openapi.json</code> from a running instance for the authoritative, live
        spec — every route, shape, error envelope, and auth requirement.
      </p>

      <h2>Routes</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {ROUTES.map((r) => (
            <tr key={r.path}>
              <td style={{ whiteSpace: "nowrap" }}>
                <code>{r.method}</code>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                <code>{r.path}</code>
              </td>
              <td>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Error envelope</h2>
      <p>All errors share one shape:</p>
      <pre>
        <code>{`{ "error": { "code": "llm_not_configured", "message": "..." } }`}</code>
      </pre>
      <p>
        Typed error codes (like <code>401 sign_in_failed</code>, <code>503 llm_not_configured</code>
        ) are stable — build against them, not against message text.
      </p>
    </ProsePage>
  );
}
