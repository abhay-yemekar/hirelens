import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Terms of Use — HireLens",
  description:
    "The terms governing use of the HireLens website and software: MIT license, operator responsibility, acceptable use.",
};

export default function TermsPage() {
  return (
    <ProsePage eyebrow="Legal" title="Terms of Use" updated="Last updated: September 2026">
      <p>
        These terms cover two things: this website, and the HireLens software itself. The software
        is licensed under the{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/blob/main/LICENSE">MIT license</a>, which
        governs copying, modification, and distribution — these terms add the plain-language context
        for how the project is intended to be used.
      </p>

      <h2>The software is provided as-is</h2>
      <p>
        HireLens is open-source software licensed under MIT, without warranty of any kind. The
        license text is the authoritative statement; in short: the authors are not liable for
        anything that goes wrong, and you use the software at your own discretion.
      </p>

      <h2>You are the operator</h2>
      <p>
        HireLens is self-hosted. Whoever deploys an instance is its operator, and with that comes
        responsibility for:
      </p>
      <ul>
        <li>the candidate data you collect into it, and your lawful basis for processing it;</li>
        <li>the decisions your team makes using its output;</li>
        <li>the model providers you configure and the keys you bring;</li>
        <li>keeping your instance, database, and secrets secured.</li>
      </ul>

      <h2>AI scores are screening aids</h2>
      <blockquote>An AI score is a screening aid, not a hiring decision.</blockquote>
      <p>
        HireLens ranks, explains, and audits — it does not decide. Every advance/reject decision in
        the product requires a human-entered reason, recorded in a tamper-evident audit log. Bias
        audit reports are statistical screens for further inquiry,{" "}
        <strong>not proof of discrimination</strong> and not legal conclusions. Employment screening
        is a regulated space (NYC Local Law 144, the EU AI Act, state laws like Illinois HB 3773):
        HireLens
        <em> helps you meet these obligations</em>; it does not make you compliant by itself.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Don't use HireLens to make fully automated decisions with no human review — that is both
          bad practice and, in many jurisdictions, unlawful.
        </li>
        <li>
          Don't upload data you have no right to process, and never commit real resumes to public
          repositories.
        </li>
        <li>
          Don't present HireLens output as a certified, validated, or legally-reviewed assessment.
        </li>
        <li>Don't use the HireLens name or branding to imply endorsement by the project.</li>
      </ul>

      <h2>The website</h2>
      <p>
        The marketing site's content (text, design, product screenshots) is part of the same MIT-
        licensed repository. Fork it, adapt it, attribute it. The HireLens name and logo remain the
        project's identity — rename derivatives per the license.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to these terms will be made via commit to the public repository — history
        is the changelog. Continued use of the website after changes means you accept the updated
        terms.
      </p>

      <h2>Contact</h2>
      <p>
        Reach a maintainer via the <a href="/contact">contact page</a>.
      </p>
    </ProsePage>
  );
}
