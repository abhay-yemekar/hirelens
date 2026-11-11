import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "API reference — CandidLens",
  description:
    "The CandidLens REST API: authenticated, org-scoped endpoints for jobs, rubrics, candidates, scoring runs, review, and bias audits. Live OpenAPI 3.1 contract.",
};

/**
 * Text that may wrap only after `sep` (a slash in a path, a bar between
 * methods). <wbr> keeps the copied text unchanged.
 */
function BreakAfter({ text, sep }: { text: string; sep: string }) {
  const parts = text.split(sep);
  return parts.map((part, i) => {
    const key = parts.slice(0, i + 1).join(sep);
    return i < parts.length - 1 ? (
      <Fragment key={key}>
        {part}
        {sep}
        <wbr />
      </Fragment>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    );
  });
}

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
    desc: "Score every candidate; waits for the run and returns its summary",
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
    path: "/api/jobs/:id/candidates/:cid/demographics",
    desc: "Candidate's opt-in demographics self-report",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/bias-audit",
    desc: "Adverse-impact report (four-fifths rule; audited)",
  },
  {
    method: "GET",
    path: "/api/talent-pool",
    desc: "Search candidates across every job in the organization",
  },
  {
    method: "POST",
    path: "/api/public/parse",
    desc: "Parse one resume without storing it (API token)",
  },
  { method: "GET", path: "/api/openapi.json", desc: "The live OpenAPI 3.1 contract" },
];

const ERRORS: Array<{ status: string; code: string; when: ReactNode }> = [
  {
    status: "400",
    code: "invalid_body",
    when: (
      <>
        The body failed validation. Some routes add the validation <code>issues</code>
      </>
    ),
  },
  {
    status: "401",
    code: "unauthorized",
    when: "No session, or no active organization. The ATS webhook also uses it for a bad token",
  },
  { status: "401", code: "invalid_token", when: "Public parse got no valid API token" },
  {
    status: "403",
    code: "forbidden",
    when: (
      <>
        Your role is too low; <code>needRole</code> names the minimum
      </>
    ),
  },
  {
    status: "404",
    code: "not_found",
    when: "No such route, or no such record in your organization",
  },
  { status: "409", code: "no_rubric", when: "You scored a job that has no rubric yet" },
  { status: "413", code: "payload_too_large", when: "The request body is over the size limit" },
  { status: "422", code: "unreadable_document", when: "No text could be read from the file" },
  { status: "429", code: "rate_limited", when: "Public parse went over the token's limit" },
  {
    status: "500",
    code: "internal_error",
    when: (
      <>
        Something failed on the server. Quote the <code>errorId</code> when you report it
      </>
    ),
  },
  { status: "503", code: "llm_not_configured", when: "No model is configured on the server" },
];

const ROLES: Array<{ role: string; can: string }> = [
  {
    role: "viewer",
    can: "Read jobs, rubrics, candidates, runs, the review table, search and the talent pool. Run a bias audit and record a demographics self-report.",
  },
  {
    role: "hiring_manager",
    can: "The same as viewer. No route asks for this role, so a hiring manager can't record decisions or override scores.",
  },
  {
    role: "recruiter",
    can: "Everything a viewer can, plus create and edit jobs and rubrics, upload and remove candidates, score, record decisions, override scores and create share links.",
  },
  {
    role: "owner",
    can: "Everything a recruiter can, plus delete jobs, manage API tokens and change the model settings.",
  },
];

export default function ApiReferencePage() {
  return (
    <ProsePage
      eyebrow="Docs · Understand"
      title="API reference"
      lede="Organization-scoped REST. People authenticate with a session cookie, integrations with an org API token, and the API serves its own OpenAPI 3.1 document."
    >
      <h2>Authentication</h2>
      <h3>Session cookie</h3>
      <p>
        Better Auth sets an HTTP-only session cookie when you sign in. Browsers send it on their
        own; other clients pass it with each request. Better Auth checks the <code>Origin</code>{" "}
        header of POST requests to its routes against <code>TRUSTED_ORIGINS</code>, so from a
        non-browser client send your web app&apos;s address as <code>Origin</code>, as the CLI does.
      </p>

      <h3>Organizations</h3>
      <p>
        The org-scoped routes need an active organization. A session without one gets{" "}
        <code>401 unauthorized</code>. After you sign in:
      </p>
      <ol>
        <li>
          <code>POST /api/auth/organization/create</code> with <code>{`{ "name", "slug" }`}</code>{" "}
          creates an organization. You become its owner.
        </li>
        <li>
          <code>POST /api/auth/organization/set-active</code> with{" "}
          <code>{`{ "organizationId" }`}</code> makes it active. Later calls are scoped to it.
        </li>
      </ol>
      <p>The CLI calls the same two routes when it creates an organization.</p>
      <pre>
        <code>{`curl -X POST http://localhost:4000/api/auth/sign-in/email \\
  -H "content-type: application/json" \\
  -H "Origin: http://localhost:3000" \\
  -d '{"email":"you@example.com","password":"..."}' -c cookies.txt

curl -X POST http://localhost:4000/api/auth/organization/set-active \\
  -H "content-type: application/json" \\
  -H "Origin: http://localhost:3000" \\
  -d '{"organizationId":"<org id>"}' -b cookies.txt -c cookies.txt

curl http://localhost:4000/api/jobs -b cookies.txt`}</code>
      </pre>

      <h3>Org API tokens</h3>
      <p>
        The ATS webhook (<code>POST /api/webhooks/ats</code>) and public parse (
        <code>POST /api/public/parse</code>) take an org API token instead of a cookie:{" "}
        <code>Authorization: Bearer hl_…</code>. A token acts as its organization. Owners create and
        revoke tokens in Settings, on the <strong>Integrations — API tokens</strong> card. You see
        the token once, when you create it, and a revoked token stops working on the next call. See{" "}
        <Link href="/docs/ats-integration">ATS integration</Link>.
      </p>
      <p>
        Public parse is rate-limited per token: 60 requests a minute by default, set by{" "}
        <code>CANDIDLENS_PARSE_RATE_LIMIT</code>. Each server instance keeps its own count. Over the
        limit you get <code>429 rate_limited</code> with a <code>Retry-After</code> header.
      </p>

      <h2>The contract</h2>
      <p>
        The API serves its OpenAPI 3.1 document at <code>GET /api/openapi.json</code>, with no
        sign-in. Any OpenAPI viewer, such as Swagger UI, Redoc, Insomnia or Bruno, can load it from
        a running instance.
      </p>
      <p>
        Its error schema is out of date. For errors, follow the error envelope at the end of this
        page.
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
            <tr key={`${r.method} ${r.path}`}>
              <td>
                <code className="hl-route-path" translate="no">
                  <BreakAfter text={r.method} sep="|" />
                </code>
              </td>
              <td>
                <code className="hl-route-path" translate="no">
                  <BreakAfter text={r.path} sep="/" />
                </code>
              </td>
              <td>{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Public parse</h3>
      <p>
        <code>POST /api/public/parse</code> parses one resume and doesn&apos;t store it. Send either
        a multipart body with a <code>file</code> part, or JSON <code>{`{ "text": "..." }`}</code>{" "}
        of up to 200,000 characters. Any other content type gets{" "}
        <code>415 unsupported_media_type</code>.
      </p>
      <pre>
        <code>{`curl -X POST https://your-host/api/public/parse \\
  -H "Authorization: Bearer hl_…" \\
  -F file=@resume.pdf`}</code>
      </pre>
      <p>The response includes:</p>
      <ul>
        <li>
          <code>parsed</code>: the parsed profile.
        </li>
        <li>
          <code>contentHash</code>: a hash of the resume text.
        </li>
        <li>
          <code>formatCheck</code>: <code>verdict</code> (<code>pass</code>, <code>warn</code> or{" "}
          <code>fail</code>), a 0–100 <code>score</code>, and <code>findings</code>, each with a{" "}
          <code>code</code>, <code>label</code> and <code>detail</code>.
        </li>
        <li>
          <code>kind</code>, <code>pageCount</code>, <code>extractedChars</code> and{" "}
          <code>warnings</code> about the document.
        </li>
      </ul>

      <h3>Talent pool</h3>
      <p>
        <code>GET /api/talent-pool</code> searches candidates across every job in your organization.
        It looks at the newest 2,000 candidates. Query parameters:
      </p>
      <ul>
        <li>
          <code>q</code>: matches the uploaded filename, email or phone.
        </li>
        <li>
          <code>skills</code>: comma-separated skill names. A candidate matches if their skills
          include any of them.
        </li>
        <li>
          <code>stage</code>: the stage of the latest decision: <code>new</code>,{" "}
          <code>shortlisted</code>, <code>advanced</code> or <code>rejected</code>.
        </li>
        <li>
          <code>minScore</code>: the lowest overall score (0–100) on the candidate&apos;s latest
          completed run.
        </li>
        <li>
          <code>page</code> and <code>pageSize</code>: <code>pageSize</code> defaults to 25, at most
          100.
        </li>
        <li>
          <code>blind=1</code>: hides filenames, email and phone, and ignores <code>q</code>.
        </li>
      </ul>
      <p>
        The response has <code>candidates</code>, <code>total</code>, <code>page</code>,{" "}
        <code>pageSize</code> and <code>facets</code> (stage and skill counts).
      </p>

      <h2>Scoring</h2>
      <p>
        <code>POST /api/jobs/:id/score</code> scores every candidate on the job against its latest
        rubric. The request waits until the run finishes, then returns{" "}
        <code>{`{ "ok": true, "summary": { ... } }`}</code>. The summary holds the{" "}
        <code>runId</code>, the rubric version, and how many candidates were scored and failed.
      </p>
      <pre>
        <code>{`curl -X POST http://localhost:4000/api/jobs/$JOB/score -b cookies.txt
curl http://localhost:4000/api/jobs/$JOB/runs/$RUN -b cookies.txt`}</code>
      </pre>
      <p>
        Pass the <code>runId</code> to <code>GET /api/jobs/:id/runs/:runId</code> for each
        candidate&apos;s overall score, criterion scores and quoted evidence. To score only the
        candidates that failed, call <code>POST /api/jobs/:id/runs/:runId/retry-failed</code>; it
        starts a new run.
      </p>

      <h2>Roles</h2>
      <p>
        Each member has one role in an organization. Routes ask for one of three levels: view
        (viewer), edit (recruiter) or admin (owner). A higher role can do everything a lower one
        can, and a call below the level gets <code>403 forbidden</code>.
      </p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>What it can do</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((r) => (
            <tr key={r.role}>
              <td style={{ whiteSpace: "nowrap" }}>
                <code>{r.role}</code>
              </td>
              <td>{r.can}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Error envelope</h2>
      <p>
        An error has <code>ok: false</code> and a short <code>error</code> code. Many routes return
        only those two fields. Some add a <code>message</code> you can show to a person.
      </p>
      <pre>
        <code>{`{ "ok": false, "error": "not_found" }
{ "ok": false, "error": "llm_not_configured", "message": "No LLM provider is configured ..." }`}</code>
      </pre>
      <p>
        Build against the HTTP status and the <code>error</code> code, not the message text. Routes
        under <code>/api/auth/*</code> are answered by Better Auth and use its own error format.
      </p>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Code</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {ERRORS.map((e) => (
            <tr key={`${e.status} ${e.code}`}>
              <td>{e.status}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <code>{e.code}</code>
              </td>
              <td>{e.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ProsePage>
  );
}
