import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Blind review & bias audits — CandidLens Docs",
  description:
    "How CandidLens masks identity cues with character alignment preserved, and how the adverse-impact audit applies the EEOC four-fifths rule with exact math.",
};

export default function BlindReviewPage() {
  return (
    <ProsePage
      eyebrow="Docs · Understand"
      title="Blind review & bias audits"
      lede="Two mechanisms, one goal: decisions based on evidence, and evidence that your decisions are fair."
    >
      <h2>Blind review</h2>
      <p>
        Turn on <strong>Blind review</strong> in the review queue to hide identity cues. In the
        resume text it masks:
      </p>
      <ul>
        <li>email addresses</li>
        <li>phone numbers</li>
        <li>web links</li>
        <li>
          the first line that has letters and is 48 characters or shorter, taken to be the name
        </li>
      </ul>
      <p>
        Schools and graduation years are <strong>not</strong> masked. The queue also lists people as
        &ldquo;Candidate 1&rdquo;, &ldquo;Candidate 2&rdquo; instead of by file name, hides the
        contact email and phone, and won&apos;t open the original file.
      </p>
      <ul>
        <li>
          Masking happens when a document is read with blind review on. The stored document never
          changes.
        </li>
        <li>
          Scoring sends the model the masked text too, unless the job&apos;s{" "}
          <code>blindReviewDefault</code> is turned off through the API. It is on by default.
        </li>
        <li>
          Each masked character becomes one <code>■</code>, so{" "}
          <strong>character alignment is preserved</strong>: masked text keeps the same length and
          offsets as the original.
        </li>
        <li>
          That means evidence spans (which are character offsets into the document) still land
          exactly. Blind mode doesn&apos;t break the product&apos;s core promise.
        </li>
      </ul>

      <h2>Decisions need a reason</h2>
      <p>
        A candidate is in one of four stages: <strong>new</strong>, <strong>shortlisted</strong>,{" "}
        <strong>advanced</strong> or <strong>rejected</strong>.
      </p>
      <ul>
        <li>
          Every decision in the review queue needs a reason of 3 to 2,000 characters. The decision
          and its reason are written to the hash-chained audit log, and earlier decisions are kept.
        </li>
        <li>Only recruiters and owners can record a decision.</li>
        <li>
          Shortlisting someone from the talent pool records the reason &ldquo;Rediscovered from the
          talent pool&rdquo;.
        </li>
      </ul>

      <h2>Demographics: opt-in, isolated, never in scoring</h2>
      <p>Bias auditing needs group data, and group data is sensitive. CandidLens handles it so:</p>
      <ul>
        <li>
          The audit groups candidates by <strong>gender</strong>, <strong>race/ethnicity</strong>,{" "}
          <strong>age band</strong> or <strong>disability</strong>.
        </li>
        <li>
          Candidates <strong>self-report</strong>, entirely opt-in. A recruiter sends a private link
          from the candidate&apos;s page. It needs no account, works once and asks about gender and
          race/ethnicity; every question can be skipped.
        </li>
        <li>
          Any member of the organization can also record a report for a candidate through the API,
          one dimension at a time. A new value replaces only that dimension and keeps the rest.
        </li>
        <li>
          Reports live in a separate table that <strong>scoring never reads</strong>, so
          demographics can&apos;t influence a score.
        </li>
        <li>
          People who don&apos;t report are bucketed as <strong>&ldquo;undisclosed&rdquo;</strong> in
          audit reports. Not knowing who you rejected is itself an audit finding, and hiding it
          would defeat the purpose.
        </li>
      </ul>

      <h2>The adverse-impact audit</h2>
      <p>Pick a dimension and run the audit. For each group it reports:</p>
      <ul>
        <li>
          <strong>Selection rate</strong>: candidates whose latest stage is shortlisted or advanced,
          divided by all candidates on the job.
        </li>
        <li>
          <strong>Impact ratio</strong>: the group&apos;s rate divided by the reference group&apos;s
          rate. The reference group is the group with the highest selection rate among groups with
          at least 4 candidates, leaving out &ldquo;undisclosed&rdquo;.
        </li>
        <li>
          <strong>The four-fifths rule</strong>: ratios below 0.80 are flagged. The math uses exact
          integer arithmetic, so <code>4/5</code> passes cleanly instead of failing on a
          floating-point 0.7999…
        </li>
        <li>
          <strong>Demographic parity difference</strong>: the reference rate minus the group&apos;s
          rate. It is 0 for the reference group.
        </li>
      </ul>
      <p>
        Groups with fewer than 4 candidates are reported but never flagged.
        &ldquo;Undisclosed&rdquo; is never the reference, but it can be flagged. When no group
        qualifies as the reference, nothing is flagged.
      </p>

      <h2>What the audit is — and isn't</h2>
      <blockquote>
        Statistical screening metrics, not a legal conclusion. CandidLens helps you meet audit
        obligations; it does not make you compliant.
      </blockquote>
      <p>
        A flagged ratio is a prompt to investigate, not proof of discrimination. A passing report is
        not a shield. Sample sizes matter: with five people in a group, one decision moves the rate
        by 20 points. Read the numbers with that in mind, and involve people who know the law in
        your jurisdiction (NYC LL144, the EU AI Act, and state laws each have their own duties).
      </p>

      <h2>Export</h2>
      <p>
        Every audit report can be exported as JSON. Running an audit writes an entry to the
        hash-chained audit log, so <em>running</em> an audit is on the record too.
      </p>

      <h2>What it doesn&apos;t do</h2>
      <ul>
        <li>
          It never infers demographics from names, photos or anything else in a resume. It uses only
          what was reported; everyone else is &ldquo;undisclosed&rdquo;.
        </li>
        <li>
          It isn&apos;t limited to recruiters. Any member of the organization, viewers included, can
          run an audit, because audits are for oversight.
        </li>
        <li>
          It doesn&apos;t give a legal verdict. Every audit report from the API carries a disclaimer
          that the numbers are screening statistics, not a legal conclusion or a guarantee of
          compliance.
        </li>
      </ul>
    </ProsePage>
  );
}
