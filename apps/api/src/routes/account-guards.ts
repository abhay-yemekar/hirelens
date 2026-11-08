/**
 * Shared checks for the account routes (password, email, deletion): a
 * signed-in user, a JSON body (which a cross-site form cannot send) and,
 * for the sensitive actions, a recent sign-in.
 */

import { auth } from "@candidlens/db";
import type { Context } from "hono";
import { sessionUserId } from "../auth.js";
import type { AppEnv } from "../types.js";

/**
 * Sensitive actions need a sign-in within this window. It is shorter than
 * Better Auth's one-day freshAge because what they change outlives the
 * session: a password, the sign-in email, the account itself.
 */
export const FRESH_SIGN_IN_MS = 15 * 60 * 1000;

export function signedInRecently(session: unknown): boolean {
  const createdAt = (session as { session?: { createdAt?: unknown } } | null)?.session?.createdAt;
  const at =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === "string"
        ? Date.parse(createdAt)
        : Number.NaN;
  return Number.isFinite(at) && Date.now() - at < FRESH_SIGN_IN_MS;
}

/**
 * The signed-in user's id, or the response that refuses the request.
 * `freshFor` names the action in the "sign in again" message and turns on
 * the recent-sign-in check.
 */
export function guardAccountRequest(
  c: Context<AppEnv>,
  freshFor?: string,
): { userId: string } | { refused: Response } {
  const userId = sessionUserId(c.get("session"));
  if (userId === null) {
    return { refused: c.json({ ok: false, error: "unauthorized" }, 401) };
  }
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
    return {
      refused: c.json(
        { ok: false, error: "unsupported_media_type", message: "Send the body as JSON." },
        415,
      ),
    };
  }
  if (freshFor && !signedInRecently(c.get("session"))) {
    return {
      refused: c.json(
        {
          ok: false,
          error: "session_not_fresh",
          message: `For your security, sign out and sign in again, then ${freshFor}.`,
        },
        403,
      ),
    };
  }
  return { userId };
}

/**
 * The web app's origin for links in emails: the request's Origin header,
 * accepted only when it is this app or one of its trusted origins, so a
 * request can't make an email point somewhere else.
 */
export function trustedWebOrigin(c: Context<AppEnv>): string | null {
  const origin = c.req.header("origin");
  if (!origin) return null;
  const trusted = new Set<string>(
    Array.isArray(auth.options.trustedOrigins) ? auth.options.trustedOrigins : [],
  );
  try {
    trusted.add(new URL(String(auth.options.baseURL)).origin);
  } catch {
    // No base URL: only the listed origins count.
  }
  return trusted.has(origin) ? origin : null;
}
