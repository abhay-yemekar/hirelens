import type { NextConfig } from "next";

/**
 * Whether the server can send email (packages/db/src/mail.ts), so the
 * sign-in pages offer "Forgot password?" and Settings offers a
 * confirmation link only when they work. Where the API runs inside this
 * app (Vercel), it is read from the same settings at build time; a
 * separate API service (docker compose) sets NEXT_PUBLIC_EMAIL_ENABLED
 * instead. Only a yes or no reaches the browser.
 */
function emailEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env["NEXT_PUBLIC_EMAIL_ENABLED"];
  if (explicit === "true" || explicit === "false") return explicit === "true";
  if (env["CANDIDLENS_SMTP_USER"] && env["CANDIDLENS_SMTP_PASSWORD"]) return true;
  // Without SMTP the server prints emails to its log on a developer machine.
  if (env["NODE_ENV"] !== "production") return true;
  try {
    const host = new URL(env["BETTER_AUTH_URL"] ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * `output: "standalone"` makes `next build` emit a minimal server bundle
 * (apps/web/.next/standalone) that the self-host Docker image runs —
 * no node_modules tree, no devDependencies, ~10× smaller runtime layer.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_EMAIL_ENABLED: emailEnabled(process.env) ? "true" : "false",
  },
};

export default nextConfig;
