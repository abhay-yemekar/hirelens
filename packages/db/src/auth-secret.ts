/**
 * The Better Auth signing secret.
 *
 * Outside production a fixed dev secret keeps `pnpm dev` and the tests
 * zero-config. In production a missing, short, or copied-from-the-example
 * secret is a startup error: sessions signed with a string that is public
 * in this repo can be forged by anyone who has read it. `next build` also
 * runs with NODE_ENV=production but signs nothing, so it is let through.
 */

export const DEV_AUTH_SECRET = "dev-only-secret-do-not-use-in-production-0123456789abcdef";

const PUBLIC_PLACEHOLDERS = new Set([DEV_AUTH_SECRET, "replace-with-32+char-random-secret"]);
const MIN_LENGTH = 32;

export function resolveAuthSecret(env: Record<string, string | undefined>): string {
  const secret = env["BETTER_AUTH_SECRET"]?.trim() ?? "";
  const production =
    env["NODE_ENV"] === "production" && env["NEXT_PHASE"] !== "phase-production-build";
  if (!production) return secret === "" ? DEV_AUTH_SECRET : secret;
  if (secret === "" || PUBLIC_PLACEHOLDERS.has(secret) || secret.length < MIN_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be set to a random value of at least ${MIN_LENGTH} characters in production (generate one with: openssl rand -base64 32)`,
    );
  }
  return secret;
}
