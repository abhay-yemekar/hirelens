/** Public (browser-safe) configuration for the web app. */
/**
 * Empty NEXT_PUBLIC_API_URL (Vercel convention for unset) means same-origin:
 * the API is mounted inside this app at /api/* (see
 * apps/web/app/api/[[...route]]/route.ts). A real URL targets a separate
 * API origin (Docker/self-host topology).
 */
export const API_URL = (process.env["NEXT_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

export const AUTH_BASE_URL = (process.env["NEXT_PUBLIC_AUTH_BASE_URL"] ?? API_URL).replace(
  /\/$/,
  "",
);

/** True when a separate API origin is configured (not the same-origin mount). */
export const API_CONFIGURED = (process.env["NEXT_PUBLIC_API_URL"] ?? "") !== "";
