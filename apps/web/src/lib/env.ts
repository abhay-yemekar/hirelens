import { normalizeOrigin } from "./site-url";

/** Public (browser-safe) configuration for the web app. */
/**
 * Empty NEXT_PUBLIC_API_URL (Vercel convention for unset) means same-origin:
 * the API is mounted inside this app at /api/* (see
 * apps/web/app/api/[[...route]]/route.ts). A real URL targets a separate
 * API origin (Docker/self-host topology). Values are normalized so a
 * scheme-less dashboard entry ("hirelens-rosy.vercel.app") cannot crash
 * the build — better-auth throws [BetterAuthError: Invalid base URL]
 * on those at import time.
 */
export const API_URL = normalizeOrigin(process.env["NEXT_PUBLIC_API_URL"] ?? "", "");

export const AUTH_BASE_URL = normalizeOrigin(
  process.env["NEXT_PUBLIC_AUTH_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_URL"],
  API_URL,
);

/** True when a separate API origin is configured (not the same-origin mount). */
export const API_CONFIGURED = API_URL !== "";
