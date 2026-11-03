/**
 * Account routes for the signed-in user, with or without an organization.
 *
 * POST /api/account/password — give an account created with Google or
 * GitHub its first password, so it can also sign in with email. Better
 * Auth exposes this only server-side (setPassword), which refuses when the
 * account already has a password (change it instead). It does not check
 * how recent the sign-in is, so this route does: a stolen older session
 * cookie must not be able to plant a password that outlives the session.
 * The body must be JSON, which a cross-site form cannot send.
 */

import { auth } from "@candidlens/db";
import { Hono } from "hono";
import { z } from "zod";
import { sessionUserId } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";

const SetPasswordSchema = z
  .object({
    newPassword: z.string().min(1).max(256),
  })
  .strip();

const SESSION_NOT_FRESH = {
  status: 403 as const,
  error: "session_not_fresh",
  message: "For your security, sign out and sign in again, then add the password.",
};

/** Better Auth error codes this route answers with its own response. */
const SET_PASSWORD_ERRORS: Record<
  string,
  { status: 400 | 401 | 409; error: string; message: string }
> = {
  UNAUTHORIZED: {
    status: 401,
    error: "unauthorized",
    message: "Your session ended. Sign in again.",
  },
  PASSWORD_ALREADY_SET: {
    status: 409,
    error: "password_already_set",
    message: "This account already has a password. Change it instead.",
  },
  PASSWORD_TOO_SHORT: {
    status: 400,
    error: "password_too_short",
    message: "Use at least 8 characters.",
  },
  PASSWORD_TOO_LONG: {
    status: 400,
    error: "password_too_long",
    message: "Use at most 128 characters.",
  },
};

/**
 * Adding a password needs a sign-in within this window. It is shorter than
 * Better Auth's one-day freshAge because a password outlives the session.
 */
const FRESH_SIGN_IN_MS = 15 * 60 * 1000;

function signedInRecently(session: unknown): boolean {
  const createdAt = (session as { session?: { createdAt?: unknown } } | null)?.session?.createdAt;
  const at =
    createdAt instanceof Date
      ? createdAt.getTime()
      : typeof createdAt === "string"
        ? Date.parse(createdAt)
        : Number.NaN;
  return Number.isFinite(at) && Date.now() - at < FRESH_SIGN_IN_MS;
}

/** The error code Better Auth puts on its APIError body, if any. */
function betterAuthCode(err: unknown): string | undefined {
  const code = (err as { body?: { code?: unknown } } | null)?.body?.code;
  return typeof code === "string" ? code : undefined;
}

export function accountRoutes() {
  const routes = new Hono<AppEnv>();

  routes.post("/account/password", async (c) => {
    if (sessionUserId(c.get("session")) === null) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
      return c.json(
        { ok: false, error: "unsupported_media_type", message: "Send the body as JSON." },
        415,
      );
    }
    if (!signedInRecently(c.get("session"))) {
      const { status, ...body } = SESSION_NOT_FRESH;
      return c.json({ ok: false, ...body }, status);
    }
    const parsed = SetPasswordSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: "invalid_body",
          message: "JSON body must include a `newPassword` string.",
        },
        400,
      );
    }

    try {
      await auth.api.setPassword({
        body: { newPassword: parsed.data.newPassword },
        headers: new Headers(c.req.header()),
      });
    } catch (err) {
      const code = betterAuthCode(err);
      const mapped = code ? SET_PASSWORD_ERRORS[code] : undefined;
      if (!mapped) throw err;
      return c.json({ ok: false, error: mapped.error, message: mapped.message }, mapped.status);
    }
    return c.json({ ok: true });
  });

  return routes;
}
