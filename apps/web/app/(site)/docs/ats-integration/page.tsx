import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "ATS integration guide — CandidLens Docs",
  description:
    "Connect Greenhouse, Lever, Ashby, Workable, or any ATS to CandidLens: the partner-by-API pattern, webhook inbound, CSV round-trip, and the CLI pipeline.",
};

export default function AtsIntegrationPage() {
  return (
    <ProsePage
      eyebrow="Docs · Integrations"
      title="ATS integration guide"
      lede="CandidLens integrates with any applicant tracking system through a stable, OpenAPI 3.1–documented REST API — not fragile per-vendor scrapers. This page shows the three integration patterns that cover Greenhouse, Lever, Ashby, Workable, Recruitee, and self-built ATS tools."
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
        Every major ATS can export a candidate list as CSV and resumes as a ZIP or folder.
        CandidLens consumes exactly that:
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
          Open the job in CandidLens → <strong>Candidates → Upload ZIP</strong>. Scores, evidence,
          and the review queue fill in like any other upload.
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
        notification", or a Zapier/Make relay) at CandidLens to screen a candidate the moment they
        reach a stage:
      </p>
      <pre>
        <code>{`POST /api/webhooks/ats
Authorization: Bearer <your API token>
Content-Type: application/json

{
  "jobId": "your-candidlens-job-id",
  "candidate": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "resumeUrl": "https://ats.example.com/files/jane-doe.pdf"
  }
}`}</code>
      </pre>
      <p>
        CandidLens fetches the resume, ingests it into the job, and it appears in the review queue.
        The endpoint is idempotent per (job, candidate) pair, so ATS retries are safe. Scope the API
        token to a single organization — the same token model the rest of the API uses.
      </p>
      <blockquote>
        Deploy note: on the hosted app (same-origin mount) the webhook lives at{" "}
        <code>/api/webhooks/ats</code>. Self-hosted Docker deployments call the API directly on its
        own origin.
      </blockquote>

      <h2 id="api">Pattern 3 — REST API / CLI (full pipeline control)</h2>
      <p>
        The whole screening pipeline is scriptable. The <Link href="/docs/cli">CLI</Link> wraps the
        main steps, and every endpoint is in the{" "}
        <Link href="/api-reference">OpenAPI 3.1 reference</Link>:
      </p>
      <pre>
        <code>{`# 1. create the job from its description (or find one: hirelens jobs list)
hirelens jobs create "Senior Data Engineer" --jd jd.md

# 2. draft the rubric from the job description with the model
#    (or bring your own: hirelens rubric import <jobId> --file rubric.json)
hirelens rubric derive <jobId>

# 3. upload the resumes the ATS exported, score every candidate on the job,
#    and save the ranking to read back into your ATS
hirelens score <jobId> ./export --json > ranking.json`}</code>
      </pre>
      <p>
        <code>jobs create</code> prints the new job&apos;s id. <code>score</code> takes a folder or
        files (<code>.pdf</code>, <code>.docx</code>, <code>.txt</code>, <code>.md</code>), not a
        ZIP: unzip the export first, or send the ZIP to{" "}
        <code>POST /api/jobs/&lt;jobId&gt;/candidates/zip</code>. Progress lines go to stderr, so{" "}
        <code>ranking.json</code> holds only the ranked list: rank, candidate id, file name and
        overall score.
      </p>

      <h2>What CandidLens deliberately does not do</h2>
      <ul>
        <li>
          <strong>No two-way sync</strong> — your ATS stays the system of record; CandidLens never
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
          Map ATS stages → CandidLens jobs explicitly; don't screen stages candidates can still
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
