/** Public (browser-safe) configuration for the web app. */
export const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export const AUTH_BASE_URL = process.env["NEXT_PUBLIC_AUTH_BASE_URL"] ?? API_URL;

/** True when the real API is configured (not the in-memory default). */
export const API_CONFIGURED = process.env["NEXT_PUBLIC_API_URL"] !== undefined;
