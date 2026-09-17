/**
 * Normalizes a user-provided origin into a valid absolute URL string.
 *
 * Vercel env vars are easy to enter without the scheme ("hirelens-rosy.
 * vercel.app"), and `new URL()` then throws ERR_INVALID_URL during the
 * build's static export. Every origin consumed at build time goes
 * through here: a missing scheme becomes https://, trailing slashes are
 * stripped, and a garbage/empty value falls back to localhost so the
 * build can never crash on misconfiguration.
 */
export function normalizeOrigin(
  raw: string | undefined,
  fallback = "http://localhost:3000",
): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return fallback;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return fallback;
  }
}
