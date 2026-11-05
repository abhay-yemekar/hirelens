/**
 * Changing the sign-in email.
 *
 * POST /api/account/email          { newEmail } — needs a recent sign-in.
 *   Emails a single-use link to the new address (valid 1 hour).
 * GET  /api/account/email/pending  — the change waiting for confirmation.
 * POST /api/account/email/confirm  { token } — applies it.
 *
 * Better Auth has its own change-email flow, but its last link signs in
 * whoever opens it while signed out; anyone could then send their own
 * link to someone else and switch that person onto their account. Here
 * the link only opens a page, and the change applies when the signed-in
 * owner of the request presses Confirm. Only a hash of the token is
 * stored, keyed by the user, so a link can't be used from another
 * account. Confirming also cancels any password-reset link still open,
 * and the old address gets a notice once the change is done.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CHANGE_EMAIL_LINK_HOURS,
  changeEmailMessage,
  createEmailCap,
  emailChangedNotice,
  mailMode,
  sendMail,
  user,
  verification,
} from "@candidlens/db";
import { and, eq, gt, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { readJson } from "../http.js";
import { captureException } from "../observability.js";
import type { AppEnv } from "../types.js";
import { guardAccountRequest, trustedWebOrigin } from "./account-guards.js";

const NewEmailSchema = z.object({ newEmail: z.email().max(254) }).strip();
const ConfirmSchema = z.object({ token: z.string().min(1).max(200) }).strip();

interface PendingChange {
  tokenHash: string;
  newEmail: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function pendingKey(userId: string): string {
  return `change-email:${userId}`;
}

/** The unexpired change waiting for this user, if any. */
async function pendingChange(
  db: AppEnv["Variables"]["db"],
  userId: string,
): Promise<PendingChange | null> {
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(
      and(eq(verification.identifier, pendingKey(userId)), gt(verification.expiresAt, new Date())),
    )
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<PendingChange>;
    return typeof parsed.tokenHash === "string" && typeof parsed.newEmail === "string"
      ? { tokenHash: parsed.tokenHash, newEmail: parsed.newEmail }
      : null;
  } catch {
    return null;
  }
}

async function emailInUse(db: AppEnv["Variables"]["db"], email: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return row !== undefined;
}

/** The status and code of a refused send from the email cap, if that's what this is. */
function capRefusal(err: unknown): { status: 429; code: string; message: string } | null {
  const e = err as { statusCode?: unknown; body?: { code?: unknown; message?: unknown } } | null;
  if (e?.statusCode !== 429 || typeof e.body?.code !== "string") return null;
  return {
    status: 429,
    code: e.body.code,
    message: typeof e.body.message === "string" ? e.body.message : "Too many emails.",
  };
}

export function accountEmailRoutes() {
  const routes = new Hono<AppEnv>();

  routes.post("/account/email", async (c) => {
    const guard = guardAccountRequest(c, "change your email");
    if ("refused" in guard) return guard.refused;
    const parsed = NewEmailSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json(
        { ok: false, error: "invalid_body", message: "Enter a valid email address." },
        400,
      );
    }
    if (mailMode() === "off") {
      return c.json(
        { ok: false, error: "email_unavailable", message: "This server can't send email." },
        503,
      );
    }
    const origin = trustedWebOrigin(c);
    if (!origin) {
      return c.json({ ok: false, error: "bad_origin" }, 400);
    }

    const db = c.get("db");
    const newEmail = parsed.data.newEmail.trim().toLowerCase();
    const [me] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, guard.userId))
      .limit(1);
    if (!me) return c.json({ ok: false, error: "unauthorized" }, 401);
    if (newEmail === me.email.toLowerCase()) {
      return c.json({ ok: false, error: "same_email", message: "That's already your email." }, 400);
    }
    if (await emailInUse(db, newEmail)) {
      return c.json(
        { ok: false, error: "email_in_use", message: "Another account uses that email." },
        409,
      );
    }

    try {
      await createEmailCap(db)("confirm", newEmail);
    } catch (err) {
      const refusal = capRefusal(err);
      if (!refusal) throw err;
      return c.json({ ok: false, error: refusal.code, message: refusal.message }, refusal.status);
    }

    // One pending change per user: a new request replaces the old link.
    const token = randomBytes(32).toString("base64url");
    const value: PendingChange = { tokenHash: hashToken(token), newEmail };
    await db.delete(verification).where(eq(verification.identifier, pendingKey(guard.userId)));
    await db.insert(verification).values({
      id: randomBytes(16).toString("hex"),
      identifier: pendingKey(guard.userId),
      value: JSON.stringify(value),
      expiresAt: new Date(Date.now() + CHANGE_EMAIL_LINK_HOURS * 60 * 60 * 1000),
    });
    await sendMail(
      changeEmailMessage(
        newEmail,
        `${origin}/confirm-email-change?token=${encodeURIComponent(token)}`,
      ),
    );
    return c.json({ ok: true });
  });

  routes.get("/account/email/pending", async (c) => {
    const userId = c.get("session")?.user?.id;
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
    const pending = await pendingChange(c.get("db"), userId);
    return c.json({ ok: true, newEmail: pending?.newEmail ?? null });
  });

  routes.post("/account/email/confirm", async (c) => {
    // No recent-sign-in check: the link proves the inbox and the session
    // proves the account, and the email may take a while to arrive.
    const guard = guardAccountRequest(c);
    if ("refused" in guard) return guard.refused;
    const parsed = ConfirmSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body" }, 400);
    }

    const db = c.get("db");
    const pending = await pendingChange(db, guard.userId);
    const expected = pending ? Buffer.from(pending.tokenHash) : null;
    const given = Buffer.from(hashToken(parsed.data.token));
    if (
      !pending ||
      !expected ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    ) {
      return c.json(
        {
          ok: false,
          error: "invalid_token",
          message: "This link has expired, was already used, or belongs to another account.",
        },
        400,
      );
    }
    const outcome = await db.transaction(async (tx) => {
      // Single use, whatever happens next; a second confirm of the same
      // link (say, a double click) finds nothing left to consume.
      const consumed = await tx
        .delete(verification)
        .where(eq(verification.identifier, pendingKey(guard.userId)))
        .returning({ id: verification.id });
      if (consumed.length === 0) return { kind: "used" as const };
      const [taken] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, pending.newEmail))
        .limit(1);
      if (taken) return { kind: "taken" as const };
      const [before] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, guard.userId))
        .for("update");
      await tx
        .update(user)
        .set({ email: pending.newEmail, emailVerified: true })
        .where(eq(user.id, guard.userId));
      // A reset link already sent to the old address resolves straight to
      // this account; it must not let that inbox take the account back.
      await tx
        .delete(verification)
        .where(
          and(
            like(verification.identifier, "reset-password:%"),
            eq(verification.value, guard.userId),
          ),
        );
      return { kind: "changed" as const, oldEmail: before?.email ?? null };
    });

    if (outcome.kind === "used") {
      return c.json(
        {
          ok: false,
          error: "invalid_token",
          message: "This link has expired, was already used, or belongs to another account.",
        },
        400,
      );
    }
    if (outcome.kind === "taken") {
      return c.json(
        { ok: false, error: "email_in_use", message: "Another account uses that email now." },
        409,
      );
    }
    if (outcome.oldEmail) {
      // Best effort: the change is done whether or not the notice goes out.
      await sendMail(emailChangedNotice(outcome.oldEmail, pending.newEmail)).catch(
        (err: unknown) => {
          captureException(err, {
            requestId: c.get("requestId"),
            path: "/api/account/email/confirm",
          });
        },
      );
    }
    return c.json({ ok: true, email: pending.newEmail });
  });

  return routes;
}
