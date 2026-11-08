/**
 * Account routes for the signed-in user, with or without an organization:
 * this file's password route, plus changing the email (account-email.ts)
 * and deleting the account (account-deletion.ts).
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
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { accountDeletionRoutes } from "./account-deletion.js";
import { accountEmailRoutes } from "./account-email.js";
import { guardAccountRequest } from "./account-guards.js";

const SetPasswordSchema = z
  .object({
    newPassword: z.string().min(1).max(256),
  })
  .strip();

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

/** The error code Better Auth puts on its APIError body, if any. */
function betterAuthCode(err: unknown): string | undefined {
  const code = (err as { body?: { code?: unknown } } | null)?.body?.code;
  return typeof code === "string" ? code : undefined;
}

export function accountRoutes() {
  const routes = new Hono<AppEnv>();

  routes.post("/account/password", async (c) => {
    const guard = guardAccountRequest(c, "add the password");
    if ("refused" in guard) return guard.refused;
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

  routes.route("/", accountEmailRoutes());
  routes.route("/", accountDeletionRoutes());
  return routes;
}
