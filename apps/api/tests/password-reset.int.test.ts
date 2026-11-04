/**
 * Password reset and email confirmation, end to end through Better Auth
 * and this app. Skips unless DATABASE_URL is set.
 *
 * Without SMTP settings, outside production, the mailer keeps each message
 * in `loggedMail`; the tests read the links from there the way a person
 * would click them in their inbox.
 */

import { auth, createDb, createEmailCap, type Database, loggedMail } from "@candidlens/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

const WEB = "http://localhost:3000";
let db: Database;
let app: ReturnType<typeof createApp>;
const STAMP = Date.now();
const created: string[] = [];
const emails: string[] = [];

async function signUp(label: string, password = "Str0ng-Passw0rd!123") {
  const email = `reset-${label}-${STAMP}@example.com`;
  const res = await auth.api.signUpEmail({
    body: { name: `Reset ${label}`, email, password, callbackURL: `${WEB}/settings?verified=1` },
    returnHeaders: true,
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  created.push(res.response.user.id);
  emails.push(email);
  return { id: res.response.user.id, email, password, cookie };
}

/** The newest email to `to` whose subject starts with `subject`. */
function lastMail(to: string, subject: string) {
  return loggedMail.filter((m) => m.to === to && m.subject.startsWith(subject)).at(-1);
}

function mailCount(to: string, subject: string) {
  return loggedMail.filter((m) => m.to === to && m.subject.startsWith(subject)).length;
}

/** The link in a message's text, as a path this app can serve. */
function linkPath(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in the email");
  const url = new URL(match[0]);
  return url.pathname + url.search;
}

async function requestReset(email: string) {
  return auth.api.requestPasswordReset({ body: { email, redirectTo: `${WEB}/reset-password` } });
}

/** Click the reset link; Better Auth redirects to the web page with ?token=. */
async function resetToken(email: string): Promise<string> {
  const mail = lastMail(email, "Reset your CandidLens password");
  if (!mail) throw new Error("no reset email");
  const res = await app.request(linkPath(mail.text));
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get("location") ?? "");
  expect(location.origin + location.pathname).toBe(`${WEB}/reset-password`);
  return location.searchParams.get("token") ?? "";
}

async function emailVerified(userId: string): Promise<boolean> {
  const result = await db.execute<{ email_verified: boolean }>(
    sql`select "email_verified" from "user" where "id" = ${userId}`,
  );
  return result.rows[0]?.email_verified === true;
}

beforeAll(() => {
  if (!available) return;
  // Never send real email from a test run, whatever the local env holds.
  delete process.env["CANDIDLENS_SMTP_USER"];
  delete process.env["CANDIDLENS_SMTP_PASSWORD"];
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });
});

afterAll(async () => {
  if (!available) return;
  for (const id of created) await db.execute(sql`delete from "user" where "id" = ${id}`);
  for (const email of emails) {
    await db.execute(
      sql`delete from "verification" where "identifier" like ${`email-sent:%:${email}`}`,
    );
  }
  await db.execute(sql`delete from "verification" where "identifier" like ${`cap-test-${STAMP}%`}`);
});

/** The session token a response sets, if any. */
function sessionCookieSet(res: Response): boolean {
  return (res.headers.get("set-cookie") ?? "").includes("session_token=");
}

describe.skipIf(!available && allowSkip)("password reset", () => {
  it("emails a link that sets a new password and signs out every session", async () => {
    const user = await signUp("flow");
    await requestReset(user.email);
    const token = await resetToken(user.email);

    const newPassword = "Brand-New-Passw0rd!789";
    await auth.api.resetPassword({ body: { newPassword, token } });

    const signIn = await auth.api.signInEmail({
      body: { email: user.email, password: newPassword },
    });
    expect(signIn.user.id).toBe(user.id);
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: user.password } }),
    ).rejects.toThrow();
    const old = await auth.api.getSession({ headers: new Headers({ cookie: user.cookie }) });
    expect(old).toBeNull();
    // The link reached the inbox, so the address counts as confirmed.
    expect(await emailVerified(user.id)).toBe(true);
  });

  it("gives an account without a password (Google or GitHub) its first one", async () => {
    const user = await signUp("social");
    await db.execute(
      sql`delete from "account" where "user_id" = ${user.id} and "provider_id" = 'credential'`,
    );
    await requestReset(user.email);
    const token = await resetToken(user.email);
    const newPassword = "First-Passw0rd!456";
    await auth.api.resetPassword({ body: { newPassword, token } });
    const signIn = await auth.api.signInEmail({
      body: { email: user.email, password: newPassword },
    });
    expect(signIn.user.id).toBe(user.id);
  });

  it("accepts each link once", async () => {
    const user = await signUp("once");
    await requestReset(user.email);
    const token = await resetToken(user.email);
    await auth.api.resetPassword({ body: { newPassword: "Once-Passw0rd!111", token } });
    await expect(
      auth.api.resetPassword({ body: { newPassword: "Twice-Passw0rd!222", token } }),
    ).rejects.toThrow();
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const email = `nobody-${STAMP}@example.com`;
    const res = await requestReset(email);
    expect(res.status).toBe(true);
    expect(mailCount(email, "Reset")).toBe(0);
  });

  it("holds the cap when requests arrive at the same moment", async () => {
    const user = await signUp("burst");
    await Promise.all(Array.from({ length: 6 }, () => requestReset(user.email)));
    expect(mailCount(user.email, "Reset your CandidLens password")).toBe(3);
  });

  it("sends at most 3 reset emails to one address per hour", async () => {
    const user = await signUp("cap");
    for (let i = 0; i < 4; i++) {
      const res = await requestReset(user.email);
      // Refused sends still answer the same way.
      expect(res.status).toBe(true);
    }
    expect(mailCount(user.email, "Reset your CandidLens password")).toBe(3);
  });
});

describe.skipIf(!available && allowSkip)("email confirmation", () => {
  it("emails a link on sign-up that confirms the address", async () => {
    const user = await signUp("confirm");
    expect(await emailVerified(user.id)).toBe(false);
    const mail = lastMail(user.email, "Confirm your email for CandidLens");
    expect(mail).toBeDefined();

    const res = await app.request(linkPath(mail?.text ?? ""));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${WEB}/settings?verified=1`);
    expect(await emailVerified(user.id)).toBe(true);
  });

  it("sends the link again on request, up to the hourly cap", async () => {
    const user = await signUp("resend");
    const headers = new Headers({ cookie: user.cookie });
    const body = { email: user.email, callbackURL: `${WEB}/settings?verified=1` };
    // Sign-up sent the first; two more fit in the hour.
    await auth.api.sendVerificationEmail({ body, headers });
    await auth.api.sendVerificationEmail({ body, headers });
    expect(mailCount(user.email, "Confirm your email")).toBe(3);
    await expect(auth.api.sendVerificationEmail({ body, headers })).rejects.toMatchObject({
      body: { code: "TOO_MANY_EMAILS" },
    });
  });

  it("does not sign anyone in from the link", async () => {
    const owner = await signUp("no-login");
    const mail = lastMail(owner.email, "Confirm your email for CandidLens");
    const res = await app.request(linkPath(mail?.text ?? ""));
    expect(res.status).toBe(302);
    expect(sessionCookieSet(res)).toBe(false);
    expect(await emailVerified(owner.id)).toBe(true);
  });

  it("leaves another signed-in person's session alone", async () => {
    const owner = await signUp("link-owner");
    const visitor = await signUp("visitor");
    const mail = lastMail(owner.email, "Confirm your email for CandidLens");
    // Someone sends their own confirmation link to another person.
    const res = await app.request(linkPath(mail?.text ?? ""), {
      headers: { cookie: visitor.cookie },
    });
    expect(res.status).toBe(302);
    expect(sessionCookieSet(res)).toBe(false);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: visitor.cookie }) });
    expect(session?.user.id).toBe(visitor.id);
  });

  it("refuses a link that has been tampered with", async () => {
    const res = await app.request(
      `/api/auth/verify-email?token=not-a-real-token&callbackURL=${encodeURIComponent(`${WEB}/settings?verified=1`)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=INVALID_TOKEN");
  });
});

describe.skipIf(!available && allowSkip)("daily email cap", () => {
  it("stops one kind of email for the day without blocking the other", async () => {
    const claim = createEmailCap(
      db,
      { perAddressPerHour: 5, perKindPerDay: { reset: 3, confirm: 2 } },
      `cap-test-${STAMP}`,
    );
    await claim("confirm", "a@example.com");
    await claim("confirm", "b@example.com");
    await expect(claim("confirm", "c@example.com")).rejects.toMatchObject({
      body: { code: "EMAIL_QUOTA_REACHED" },
    });
    // Password resets keep their own share.
    await expect(claim("reset", "c@example.com")).resolves.toBeUndefined();
  });
});
