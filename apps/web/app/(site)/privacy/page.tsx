import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Privacy Policy — HireLens",
  description:
    "What HireLens collects (almost nothing), what self-hosters are responsible for, and how candidate data is treated.",
};

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Privacy Policy"
      updated="Last updated: September 2026 · Applies to the HireLens software and this marketing site"
    >
      <p>
        HireLens is open-source software that <strong>you self-host</strong>. There is no HireLens
        cloud service holding your data, and there is no HireLens account to sign up for on this
        website. That shape makes this policy short — and it puts the data in your hands, not ours.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>
          <strong>We don't collect your data.</strong> Running HireLens does not send your resumes,
          rubrics, scores, or audit logs anywhere. Everything lives in your own Postgres database.
        </li>
        <li>
          <strong>Optional telemetry is opt-in.</strong> Error tracking (Sentry), LLM tracing
          (Langfuse), and product analytics (PostHog) are <em>off by default</em> and activate only
          if the operator explicitly configures the corresponding keys.
        </li>
        <li>
          <strong>Candidate data is yours to govern.</strong> Whoever operates a HireLens instance
          is the data controller for the candidate data in it. This page is not a substitute for
          your own privacy obligations to candidates.
        </li>
      </ul>

      <h2>What this website collects</h2>
      <p>
        This marketing site is static. It sets no advertising or tracking cookies. If the operator
        of the deployment has enabled PostHog, standard web analytics (page views, referrer) are
        collected with <strong>autocapture disabled</strong> — meaning only explicit product events
        are recorded, never raw DOM content or form input.
      </p>

      <h2>What a self-hosted instance stores</h2>
      <ul>
        <li>Account email, name, and a hashed password (or OAuth identity) — for sign-in only.</li>
        <li>Job descriptions, rubrics, and uploaded resume documents.</li>
        <li>Parsed candidate records, scores, evidence spans, and decisions.</li>
        <li>
          An append-only, hash-chained audit log of every scoring run, override, and decision.
        </li>
        <li>
          <strong>Demographic self-reports are opt-in, per candidate, per dimension</strong>, stored
          in an isolated table that is never joined into scoring queries. Candidates may decline;
          non-reporting is bucketed as &ldquo;undisclosed&rdquo; in audits — because not knowing who
          you rejected is itself an audit finding.
        </li>
      </ul>

      <h2>LLM providers</h2>
      <p>
        Scoring runs through a model <strong>you choose</strong>: a cloud provider (Gemini,
        Anthropic, Groq, OpenRouter) with your own API key, or a fully local Ollama instance. If
        resume privacy is paramount, use local mode — then resumes never leave your infrastructure.
        When you use a cloud provider, that provider processes the resume text under
        <em> its</em> terms and its own privacy policy; HireLens adds nothing to that data path.
      </p>

      <h2>Retention and erasure</h2>
      <p>
        There is no vendor retention period to negotiate — your database, your retention policy.
        Deleting a candidate removes their documents, parsed records, scores, and evidence. Audit
        log entries are append-only by design so that a deletion is itself auditable.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? See the <a href="/contact">contact page</a> — GitHub issues are
        the fastest channel for a project like this.
      </p>

      <hr />
      <p>
        <strong>Compliance note.</strong> HireLens is a tool that helps organizations meet
        obligations like NYC Local Law 144 or the EU AI Act's documentation duties. It is not legal
        advice and does not by itself make any deployment compliant. An AI score is a screening aid,
        not a hiring decision.
      </p>
    </ProsePage>
  );
}
