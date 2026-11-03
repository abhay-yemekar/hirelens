/**
 * Account route integration test: adding a first password to an account
 * that signs in with Google or GitHub. Skips unless DATABASE_URL is set.
 *
 * A real OAuth sign-in is not possible in tests, so an "OAuth-only" user
 * is made by signing up with email and then deleting that user's
 * password (credential) row: the same state Google sign-up leaves.
 */

import { auth, createDb, type Database } from "@candidlens/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let db: Database;
let app: ReturnType<typeof createApp>;
const STAMP = Date.now();
const created: string[] = [];

/** Sign up a user; returns its id, email and session cookie. */
async function signUp(label: string, password = "Str0ng-Passw0rd!123") {
  const email = `account-${label}-${STAMP}@example.com`;
  const res = await auth.api.signUpEmail({
    body: { name: `Account ${label}`, email, password },
    returnHeaders: true,
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  created.push(res.response.user.id);
  return { id: res.response.user.id, email, cookie };
}

/** Remove the user's password, as if they had signed up with Google. */
async function dropPassword(userId: string): Promise<void> {
  await db.execute(
    sql`delete from "account" where "user_id" = ${userId} and "provider_id" = 'credential'`,
  );
}

/** Make the user's sessions look as if they signed in `age` ago (a Postgres interval). */
async function setSignInAge(userId: string, age: string): Promise<void> {
  await db.execute(
    sql`update "session" set "created_at" = now() - ${age}::interval where "user_id" = ${userId}`,
  );
}

function setPassword(cookie: string, newPassword: unknown) {
  return app.request("/api/account/password", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
}

beforeAll(() => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });
});

afterAll(async () => {
  if (!available) return;
  for (const id of created) {
    await db.execute(sql`delete from "user" where "id" = ${id}`);
  }
});

describe.skipIf(!available && allowSkip)("POST /api/account/password", () => {
  it("rejects signed-out callers", async () => {
    const res = await setPassword("", "Another-Passw0rd!456");
    expect(res.status).toBe(401);
  });

  it("lets an account without a password add one, then sign in with it", async () => {
    const user = await signUp("oauth-only");
    await dropPassword(user.id);
    const newPassword = "Brand-New-Passw0rd!789";

    const res = await setPassword(user.cookie, newPassword);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const signIn = await auth.api.signInEmail({
      body: { email: user.email, password: newPassword },
    });
    expect(signIn.user.id).toBe(user.id);
  });

  it("refuses to overwrite an existing password", async () => {
    const user = await signUp("has-password");
    const res = await setPassword(user.cookie, "Another-Passw0rd!456");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("password_already_set");
  });

  it("rejects a password that is too short or too long", async () => {
    const user = await signUp("length");
    await dropPassword(user.id);
    const short = await setPassword(user.cookie, "short");
    expect(short.status).toBe(400);
    expect(((await short.json()) as { error: string }).error).toBe("password_too_short");
    const long = await setPassword(user.cookie, "x".repeat(200));
    expect(long.status).toBe(400);
    expect(((await long.json()) as { error: string }).error).toBe("password_too_long");
  });

  it("asks for a fresh sign-in when the user signed in more than 15 minutes ago", async () => {
    const user = await signUp("stale");
    await dropPassword(user.id);
    await setSignInAge(user.id, "20 minutes");
    const res = await setPassword(user.cookie, "Another-Passw0rd!456");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("session_not_fresh");
  });

  it("accepts a sign-in from 10 minutes ago", async () => {
    const user = await signUp("recent");
    await dropPassword(user.id);
    await setSignInAge(user.id, "10 minutes");
    const res = await setPassword(user.cookie, "Another-Passw0rd!456");
    expect(res.status).toBe(200);
  });

  it("rejects a body without newPassword, or that is not JSON", async () => {
    const user = await signUp("no-body");
    const post = (contentType: string, body: string) =>
      app.request("/api/account/password", {
        method: "POST",
        headers: { cookie: user.cookie, "content-type": contentType },
        body,
      });

    const empty = await post("application/json", JSON.stringify({}));
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe("invalid_body");

    const malformed = await post("application/json", "{not json");
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toBe("invalid_body");

    // What a cross-site HTML form can send: refused before anything else.
    const form = await post("text/plain", JSON.stringify({ newPassword: "Another-Passw0rd!456" }));
    expect(form.status).toBe(415);
  });
});
