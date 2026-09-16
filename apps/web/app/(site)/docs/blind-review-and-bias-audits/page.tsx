import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Blind review & bias audits — HireLens Docs",
  description:
    "How HireLens masks identity cues with character alignment preserved, and how the adverse-impact audit applies the EEOC four-fifths rule with exact math.",
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
        One toggle in the review queue masks identity cues:{" "}
        <strong>name, contact details, schools, graduation years</strong>. The implementation
        matters as much as the feature:
      </p>
      <ul>
        <li>
          Masking happens at the presentation layer with{" "}
          <strong>character alignment preserved</strong> — masked text keeps the same length and
          offsets as the original.
        </li>
        <li>
          That means evidence spans (which are character offsets into the document) still land
          exactly. Blind mode doesn't break the product's core promise.
        </li>
      </ul>

      <h2>Demographics: opt-in, isolated, never in scoring</h2>
      <p>
        Bias auditing needs group data, and group data is sensitive. HireLens takes the only
        defensible position:
      </p>
      <ul>
        <li>
          Candidates <strong>self-report</strong>, per dimension (e.g. gender), entirely opt-in.
        </li>
        <li>
          Reports live in an isolated table that is{" "}
          <strong>never joined into scoring queries</strong> — the schema makes it structurally
          impossible for demographics to influence a score.
        </li>
        <li>
          People who don't report are bucketed as <strong>&ldquo;undisclosed&rdquo;</strong> in
          audit reports. Not knowing who you rejected is itself an audit finding, and hiding it
          would defeat the purpose.
        </li>
      </ul>

      <h2>The adverse-impact audit</h2>
      <p>One click computes, per group and per dimension:</p>
      <ul>
        <li>
          <strong>Selection rate</strong> — advanced-or-shortlisted ÷ considered.
        </li>
        <li>
          <strong>Impact ratio</strong> — each group's rate ÷ the reference group's rate (or the
          overall rate when no majority group is defined).
        </li>
        <li>
          <strong>The four-fifths rule</strong> — ratios below 0.80 are flagged. The math uses exact
          integer arithmetic, so <code>4/5</code> passes cleanly instead of failing on a
          floating-point 0.7999…
        </li>
        <li>
          <strong>Demographic parity difference</strong> — the largest gap between group rates.
        </li>
      </ul>

      <h2>What the audit is — and isn't</h2>
      <blockquote>
        Statistical screening metrics, not a legal conclusion. HireLens helps you meet audit
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
        Every audit report can be exported as JSON — and the export itself is written to the
        hash-chained audit log, so <em>running</em> an audit is on the record too.
      </p>
    </ProsePage>
  );
}
