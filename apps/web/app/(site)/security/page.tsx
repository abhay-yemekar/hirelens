import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = {
  title: "Security — HireLens",
  description:
    "How to report a security vulnerability in HireLens privately, what to include, and the project's security posture.",
};

export default function SecurityPage() {
  return (
    <ProsePage
      eyebrow="Project"
      title="Security policy"
      lede="Found a vulnerability? Do not open a public issue — here is the private path, and what the project does to earn trust."
    >
      <h2>Reporting a vulnerability</h2>
      <ol>
        <li>
          Use GitHub's <strong>private vulnerability reporting</strong> on the repository, or
          contact the maintainer directly through{" "}
          <a href="https://www.linkedin.com/in/abhayyemekar/">LinkedIn</a>.
        </li>
        <li>
          Include: affected component, reproduction steps, impact assessment, and any
          proof-of-concept.
        </li>
        <li>
          You'll get an acknowledgement and a fix timeline. Coordinated disclosure — credit given.
        </li>
      </ol>

      <h2>Security posture</h2>
      <ul>
        <li>
          <strong>Secrets:</strong> never in code. Every env var is documented in{" "}
          <code>.env.example</code> files; secret scanning runs in CI.
        </li>
        <li>
          <strong>Trust boundaries:</strong> Zod schemas validate HTTP bodies, LLM output, env vars,
          and file uploads. A partial LLM config fails at boot rather than half-working.
        </li>
        <li>
          <strong>Auth:</strong> Better Auth with HTTP-only signed cookies; a partial OAuth config
          disables the provider rather than degrading.
        </li>
        <li>
          <strong>Demo endpoint:</strong> the public no-signup scorer is rate-limited per IP and
          globally, and caches results. It exposes only synthetic data.
        </li>
        <li>
          <strong>Integrity:</strong> the audit log is append-only and hash-chained — tampering is
          detectable by recomputing the chain.
        </li>
      </ul>

      <h2>Data handling expectation</h2>
      <p>
        HireLens is self-hosted: candidate data lives in your database, under your controls. The
        project's own surface holds none of it. If your deployment must not send resume text to any
        third party, use the local Ollama mode — the entire pipeline then runs inside your network.
      </p>

      <p>
        Supported versions and the response process are detailed in{" "}
        <a href="https://github.com/abhay-yemekar/hirelens/blob/main/SECURITY.md">SECURITY.md</a>.
      </p>
    </ProsePage>
  );
}
