import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "ATS integration guide — HireLens Docs",
  description:
    "Connect Greenhouse, Lever, Ashby, Workable, or any ATS to HireLens: the partner-by-API pattern, webhook inbound, CSV round-trip, and the CLI pipeline.",
};

export default function AtsIntegrationPage() {
  return (
    <ProsePage
      eyebrow="Docs · Integrations"
      title="ATS integration guide"
      lede="HireLens integrates with any applicant tracking system through a stable, OpenAPI 3.1–documented REST API — not fragile per-vendor scrapers. This page shows the three integration patterns that cover Greenhouse, Lever, Ashby, Workable, Recruitee, and self-built ATS tools."
    >
      <h2>Which pattern fits your ATS?</h2>
      <table>
        <thead>
          <tr>
            <th>Your situation</th>
            <th>Pattern</th>
            <th>Effort</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Your ATS exports candidates as files (most do)</td>
            <td>
              <a href="#csv">CSV / ZIP round-trip</a>
            </td>
            <td>~10 minutes, no code</td>
          </tr>
          <tr>
            <td>You want zero manual steps</td>
            <td>
              <a href="#webhook">Inbound webhook</a>
            </td>
            <td>~1 hour, small script</td>
          </tr>
          <tr>
            <td>You run pipelines / want full control</td>
            <td>
              <a href="#api">REST API or CLI</a>
            </td>
            <td>~1 hour, any language</td>
          </tr>
        </tbody>
      </table>

      <h2 id="csv">Pattern 1 — the CSV / ZIP round-trip (works with every ATS)</h2>
      <p>
        Every major ATS can export a candidate list as CSV and resumes as a ZIP or folder. HireLens
        consumes exactly that:
      </p>
      <ol>
        <li>
          In your ATS, export the candidate stage you want to screen (Greenhouse:{" "}
          <em>Reports → Candidates</em>; Lever: <em>Export → CSV</em>; Ashby:{" "}
          <em>Analytics → export</em>).
        </li>
        <li>
          Zip the resume files — filenames are the candidate labels, so <code>jane-doe.pdf</code>{" "}
          shows up as <strong>Jane Doe</strong> in the review queue.
        </li>
        <li>
          Open the job in HireLens → <strong>Candidates → Upload ZIP</strong>. Scores, evidence, and
          the review queue fill in like any other upload.
        </li>
        <li>
          When decisions are made, export <strong>Review queue → CSV</strong> and import it back
          into your ATS, or share candidate report links directly from each candidate page.
        </li>
      </ol>
      <p>
        This is the pattern we recommend starting with: it respects your ATS as the system of record
        and needs no admin approval from your ATS vendor.
      </p>

      <h2 id="webhook">Pattern 2 — inbound webhook (automatic screening)</h2>
      <p>
        Point your ATS's outgoing webhook (Greenhouse "custom webhook", Lever "stagetype
        notification", or a Zapier/Make relay) at HireLens to screen a candidate the moment they
        reach a stage:
      </p>
      <pre>
        <code>{`POST /api/webhooks/ats
Authorization: Bearer <your API token>
Content-Type: application/json

{
  "jobId": "your-hirelens-job-id",
  "candidate": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "resumeUrl": "https://ats.example.com/files/jane-doe.pdf"
  }
}`}</code>
      </pre>
      <p>
        HireLens fetches the resume, ingests it into the job, and it appears in the review queue.
        The endpoint is idempotent per (job, candidate) pair, so ATS retries are safe. Scope the API
        token to a single organization — the same token model the rest of the API uses.
      </p>
      <blockquote>
        Deploy note: on hirelens.app (same-origin mount) the webhook lives at{" "}
        <code>/api/webhooks/ats</code>. Self-hosted Docker deployments call the API directly on its
        own origin.
      </blockquote>

      <h2 id="api">Pattern 3 — REST API / CLI (full pipeline control)</h2>
      <p>
        The whole screening pipeline is scriptable. The <a href="/docs/cli">CLI</a> wraps it, and
        every endpoint is in the <a href="/api-reference">OpenAPI 3.1 reference</a>:
      </p>
      <pre>
        <code>{`# 1. create the job (or reuse one)
hirelens jobs create --title "Senior Data Engineer"

# 2. derive the rubric from the JD (LLM, one call)
hirelens rubrics derive --job <job-id> --jd jd.md

# 3. screen a folder the ATS exported
hirelens resumes upload --job <job-id> --zip export.zip
hirelens scoring run --job <job-id>

# 4. read results back into your ATS
hirelens scoring results --job <job-id> --format json`}</code>
      </pre>

      <h2>What HireLens deliberately does not do</h2>
      <ul>
        <li>
          <strong>No two-way sync</strong> — your ATS stays the system of record; HireLens never
          overwrites stages or dispositions. You push results back explicitly.
        </li>
        <li>
          <strong>No vendor-specific scrapers</strong> — when Greenhouse or Lever change their
          internals, integrations built on our documented API keep working.
        </li>
        <li>
          <strong>No resume data retention beyond the job</strong> — deleting the job removes its
          documents and embeddings, which keeps you compliant with your own retention policy.
        </li>
      </ul>

      <h2>Checklist for production integrations</h2>
      <ul>
        <li>Create a dedicated API token per ATS (revocable independently).</li>
        <li>
          Map ATS stages → HireLens jobs explicitly; don't screen stages candidates can still
          withdraw at.
        </li>
        <li>Share candidate report links only for stages where your process has passed consent.</li>
        <li>
          Run the bias audit on the combined population after each hiring cycle, not per-webhook.
        </li>
      </ul>
    </ProsePage>
  );
}
