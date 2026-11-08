import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Resume Doctor — CandidLens Docs",
  description:
    "How the CandidLens Resume Doctor checks a resume the way an applicant-tracking system reads it: about 30 deterministic checks, a score that starts at 100, and every finding pinned to its line.",
};

export default function ResumeDoctorDocsPage() {
  return (
    <ProsePage
      eyebrow="Docs · Use"
      title="Resume Doctor"
      lede="A deterministic resume check for candidates. It reads a resume the way an applicant-tracking system does and tells you what to fix, with every finding pinned to its line."
    >
      <p>
        The <Link href="/doctor">Resume Doctor</Link> is the candidate-side counterpart to scoring:
        no job description and no model involved.
      </p>

      <h2>What it checks</h2>
      <p>About 30 checks in six groups:</p>
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Looks for</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Contact</td>
            <td>A name, an email address and a phone number in plain text</td>
          </tr>
          <tr>
            <td>Structure</td>
            <td>Standard section headings, and roles the parser can read</td>
          </tr>
          <tr>
            <td>Dates</td>
            <td>Dates on the roles, in order, and none in the future</td>
          </tr>
          <tr>
            <td>Impact</td>
            <td>
              Numbers that show results, bullets that open with a concrete verb, no first person
            </td>
          </tr>
          <tr>
            <td>Brevity</td>
            <td>Overall length and overly long bullets</td>
          </tr>
          <tr>
            <td>Parseability</td>
            <td>Scanned pages, tables, multi-column layouts and broken encoding</td>
          </tr>
        </tbody>
      </table>
      <p>Each finding is pinned to the exact line of the resume, so the page can highlight it.</p>

      <h2>How the score works</h2>
      <ul>
        <li>
          The score starts at <strong>100</strong>, and each finding subtracts a fixed amount.
          Nothing is curved, and nothing can raise a weak resume&apos;s score.
        </li>
        <li>
          <strong>Excellent</strong> needs 85 or more and no hard failures. <strong>Good</strong> is
          60 or more. Below 60, or with two or more hard failures, the band is{" "}
          <strong>needs work</strong> whatever the number.
        </li>
        <li>The checks are plain code, so the same text always gets the same report.</li>
        <li>
          &ldquo;No email&rdquo; or &ldquo;no dates&rdquo; are reported as facts about the text; the
          Doctor never invents content for a resume.
        </li>
      </ul>

      <h2>What it reads</h2>
      <p>
        Paste text, or upload a PDF, Word (<code>.docx</code>), <code>.txt</code> or{" "}
        <code>.md</code> file of up to 10&nbsp;MB. A scanned PDF has no selectable text; export a
        text-based PDF or Word file instead, or paste the text.
      </p>
      <p>Role lines are read in the common forms, for example:</p>
      <pre>
        <code>{`Senior Engineer – Acme Corp – Jan 2022 – Present
Senior Engineer—Acme Corp, Remote (Pune, MH) Mar 2026 – Present
Senior Engineer at Acme Corp, 2021 – 2024`}</code>
      </pre>
      <p>
        Dates can also sit on the line under the title. When an Experience heading is found but no
        role line can be read, the Doctor says so (&ldquo;Couldn&apos;t read your roles&rdquo;)
        instead of claiming there is no experience section.
      </p>

      <h2>Privacy</h2>
      <p>
        The Doctor needs a signed-in account. Candidates outside an organization get the report
        without anything being stored. Inside an organization, a score history is kept, storing a
        hash of the text, never the resume itself.
      </p>
    </ProsePage>
  );
}
