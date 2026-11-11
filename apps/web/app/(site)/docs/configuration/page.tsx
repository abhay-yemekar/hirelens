import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Configuration — CandidLens Docs",
  description:
    "Every CandidLens setting, grouped by what it turns on: core, sign-in, email, models and observability.",
};

type Setting = { names: string[]; purpose: ReactNode };

/**
 * A setting name that may wrap only after an underscore. <wbr> leaves the
 * copied text unchanged, unlike a zero-width space.
 */
function SettingName({ name }: { name: string }) {
  const parts = name.split("_");
  return parts.map((part, i) => {
    const key = parts.slice(0, i + 1).join("_");
    return i < parts.length - 1 ? (
      <Fragment key={key}>
        {part}_<wbr />
      </Fragment>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    );
  });
}

function SettingsTable({ rows }: { rows: Setting[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Variable</th>
          <th>Purpose</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.names.join()}>
            <td>
              <span className="flex flex-col items-start gap-1">
                {row.names.map((name) => (
                  <code key={name} className="hl-setting-name" translate="no">
                    <SettingName name={name} />
                  </code>
                ))}
              </span>
            </td>
            <td>{row.purpose}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CORE: Setting[] = [
  {
    names: ["DATABASE_URL"],
    purpose: (
      <>
        Postgres connection, e.g. <code>postgres://postgres:postgres@localhost:5433/hirelens</code>
      </>
    ),
  },
  {
    names: ["BETTER_AUTH_SECRET"],
    purpose: (
      <>
        Signs sessions. At least 32 random characters (<code>openssl rand -base64 32</code>);
        production refuses to start without one
      </>
    ),
  },
  {
    names: ["BETTER_AUTH_URL"],
    purpose: "The app's public address; sign-in callbacks and email links are built from it",
  },
  {
    names: ["TRUSTED_ORIGINS", "CORS_ORIGINS"],
    purpose: "Comma-separated origins allowed to start sign-in or call the API",
  },
  {
    names: ["NEXT_PUBLIC_SITE_URL"],
    purpose: "Canonical address for the sitemap, robots and link previews",
  },
  {
    names: ["NEXT_PUBLIC_API_URL"],
    purpose:
      "Leave empty when the API runs inside the web app (Vercel); set it for a separate API service",
  },
  { names: ["PORT"], purpose: "API port when it runs on its own (default 4000)" },
];

const SIGN_IN: Setting[] = [
  {
    names: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    purpose: (
      <>
        Google sign-in. Redirect URL: <code>&lt;origin&gt;/api/auth/callback/google</code>
      </>
    ),
  },
  {
    names: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    purpose: (
      <>
        GitHub sign-in. Redirect URL: <code>&lt;origin&gt;/api/auth/callback/github</code>
      </>
    ),
  },
  {
    names: ["NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED", "NEXT_PUBLIC_GITHUB_OAUTH_ENABLED"],
    purpose: (
      <>
        Show the matching button. Set to <code>true</code> only when the server keys above exist
      </>
    ),
  },
];

const EMAIL: Setting[] = [
  {
    names: ["CANDIDLENS_SMTP_USER", "CANDIDLENS_SMTP_PASSWORD"],
    purpose:
      "SMTP sign-in. The defaults fit a Gmail account with 2-Step Verification and an app password; use a dedicated account, not a personal one",
  },
  {
    names: ["CANDIDLENS_SMTP_HOST", "CANDIDLENS_SMTP_PORT"],
    purpose:
      "Another provider. Port 465 starts with TLS; any other port must upgrade to TLS before the password is sent",
  },
  {
    names: ["CANDIDLENS_MAIL_FROM"],
    purpose: (
      <>
        The sender, e.g. <code>&quot;CandidLens&quot; &lt;you@example.com&gt;</code>
      </>
    ),
  },
  {
    names: ["NEXT_PUBLIC_EMAIL_ENABLED"],
    purpose:
      "Only with a separate API service: whether the web app offers the email features. On Vercel it is worked out from the SMTP settings",
  },
];

const MODELS: Setting[] = [
  {
    names: ["CANDIDLENS_LLM_PROVIDER", "CANDIDLENS_LLM_MODEL"],
    purpose: (
      <>
        Turns on scoring: <code>google</code>, <code>anthropic</code>, <code>groq</code>,{" "}
        <code>openrouter</code>, <code>mistral</code>, <code>cerebras</code> or <code>ollama</code>
      </>
    ),
  },
  {
    names: ["CANDIDLENS_LLM_API_KEY", "CANDIDLENS_LLM_BASE_URL"],
    purpose: "The provider's key, and its address for Ollama or a compatible gateway",
  },
  {
    names: ["CANDIDLENS_LLM_FALLBACKS"],
    purpose: (
      <>
        Failover chain, e.g. <code>groq,openrouter</code>, tried only when the primary is overloaded
        or rate-limited. Each fallback needs <code>CANDIDLENS_LLM_&lt;ID&gt;_MODEL</code> (plus{" "}
        <code>_API_KEY</code>, <code>_BASE_URL</code>); a fallback never borrows the primary&apos;s
        model id
      </>
    ),
  },
  {
    names: ["CANDIDLENS_LLM_DEADLINE_MS"],
    purpose:
      "Overall retry and failover budget (default 120000 ms, at most 600000) so a request can't outlive a serverless limit",
  },
  {
    names: ["CANDIDLENS_EMBEDDING_API_KEY"],
    purpose: (
      <>
        A Google AI key for search by meaning; resume text goes to Google&apos;s embedding model,{" "}
        <code>gemini-embedding-2</code>. Without it, the model key is used when the provider is{" "}
        <code>google</code>, then <code>CANDIDLENS_LLM_GOOGLE_API_KEY</code>. Another
        provider&apos;s key is never sent to Google; with no Google key, search matches keywords
      </>
    ),
  },
];

const OBSERVABILITY: Setting[] = [
  { names: ["SENTRY_DSN"], purpose: "Error tracking" },
  {
    names: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"],
    purpose: "Model tracing",
  },
  {
    names: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    purpose: "Product analytics: explicit events only, autocapture off",
  },
];

export default function ConfigurationDocsPage() {
  return (
    <ProsePage
      eyebrow="Docs · Operate"
      title="Configuration"
      lede="Every setting, grouped by what it turns on."
    >
      <p>
        Each package that needs secrets has a <code>.env.example</code> documenting its variables:
        the root one for Docker Compose, plus <code>packages/db</code>, <code>apps/api</code> and{" "}
        <code>apps/web</code>. Settings used to be named <code>HIRELENS_*</code>; those names still
        work, and the <code>CANDIDLENS_*</code> name wins when both are set. Empty values count as
        unset.
      </p>
      <p>
        On Vercel, changed variables reach only new deployments, so redeploy after editing them.
        Variables that start with <code>NEXT_PUBLIC_</code> are built into the web app, so they also
        need a rebuild.
      </p>

      <h2 id="core">Core</h2>
      <SettingsTable rows={CORE} />

      <h2 id="sign-in">Sign-in</h2>
      <SettingsTable rows={SIGN_IN} />

      <h2 id="email">Email</h2>
      <p>
        Email powers password reset, email confirmation and changing an email. See{" "}
        <Link href="/docs/accounts-and-sign-in#email-features">Accounts &amp; sign-in</Link>.
      </p>
      <SettingsTable rows={EMAIL} />
      <p>
        Without the SMTP settings, a development server prints each email (with its link) to its
        log, and a production server hides the email features. Gmail sends about 500 emails a day;
        mail from a new Gmail account may land in spam at first.
      </p>

      <h2 id="models">Models</h2>
      <SettingsTable rows={MODELS} />
      <p>
        Without a model, the model-backed features (scoring, rubric drafting and Ask) are off and
        the rest of the app works; the public demo falls back to a deterministic heuristic.
      </p>

      <h2 id="observability">Observability</h2>
      <p>All optional, and off until set. Nothing phones home by default.</p>
      <SettingsTable rows={OBSERVABILITY} />

      <h2 id="checking-a-deployment">Checking a deployment</h2>
      <p>
        <code>GET /api/health</code> answers quickly without touching the database.{" "}
        <code>GET /api/health?db=1</code> also compares the applied migrations with the code, and
        answers <code>503</code> with <code>&quot;migrationsPending&quot;: true</code> and a message
        naming the command to run when the schema is behind.
      </p>
    </ProsePage>
  );
}
