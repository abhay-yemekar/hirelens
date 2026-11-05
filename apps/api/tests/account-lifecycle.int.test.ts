/**
 * Changing the sign-in email and deleting the account, end to end.
 * Skips unless DATABASE_URL is set.
 *
 * Emails are read from `loggedMail` (no SMTP settings outside production),
 * the way a person would open them.
 */

import { hashLink } from "@candidlens/core";
import { auth, createDb, type Database, loggedMail } from "@candidlens/db";
import { appendAudit } from "@candidlens/orchestrator";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { deleteOrgCompletely } from "./helpers.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

const WEB = "http://localhost:3000";
const PASSWORD = "Str0ng-Passw0rd!123";
let db: Database;
let app: ReturnType<typeof createApp>;
const STAMP = Date.now();
const users: string[] = [];
const orgs: string[] = [];

async function signUp(label: string) {
  const email = `life-${label}-${STAMP}@example.com`;
  const res = await auth.api.signUpEmail({
    body: { name: `Life ${label}`, email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  users.push(res.response.user.id);
  return { id: res.response.user.id, email, cookie };
}

function post(path: string, cookie: string, body: unknown, origin: string | null = WEB) {
  return app.request(path, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

function lastMail(to: string, subject: string) {
  return loggedMail.filter((m) => m.to === to && m.subject.startsWith(subject)).at(-1);
}

/** The token in the change-email link, as a person would follow it. */
function changeToken(newEmail: string): string {
  const mail = lastMail(newEmail, "Confirm your new email for CandidLens");
  const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("no change-email link");
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe(`${WEB}/confirm-email-change`);
  return url.searchParams.get("token") ?? "";
}

async function userRow(id: string) {
  const result = await db.execute<{ name: string; email: string; email_verified: boolean }>(
    sql`select "name", "email", "email_verified" from "user" where "id" = ${id}`,
  );
  return result.rows[0];
}

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute<{ n: string }>(query);
  return Number(result.rows[0]?.n ?? 0);
}

async function createOrg(owner: { cookie: string }, label: string): Promise<string> {
  const org = await auth.api.createOrganization({
    body: { name: `Life ${label} Org`, slug: `life-${label}-${STAMP}` },
    headers: new Headers({ cookie: owner.cookie }),
  });
  orgs.push(org.id);
  return org.id;
}

async function addMember(orgId: string, userId: string, role: string): Promise<void> {
  await db.execute(
    sql`insert into "member" ("id", "organization_id", "user_id", "role", "created_at")
        values (${`m-${orgId}-${userId}`}, ${orgId}, ${userId}, ${role}, now())`,
  );
}

/** Recompute every link of an org's audit chain. */
async function chainIntact(orgId: string): Promise<boolean> {
  const result = await db.execute<{
    actor_id: string | null;
    action: string;
    payload: unknown;
    prev_hash: string;
    hash: string;
    created_at: string | Date;
  }>(
    sql`select "actor_id", "action", "payload", "prev_hash", "hash", "created_at"
        from "audit_log" where "org_id" = ${orgId} order by "seq"`,
  );
  let previous: string | null = null;
  for (const row of result.rows) {
    if (previous !== null && row.prev_hash !== previous) return false;
    const recomputed = hashLink({
      actorId: row.actor_id,
      action: row.action,
      payload: row.payload,
      prevHash: row.prev_hash,
      createdAt: new Date(row.created_at),
    });
    if (recomputed !== row.hash) return false;
    previous = row.hash;
  }
  return true;
}

function setSignInAge(userId: string, age: string) {
  return db.execute(
    sql`update "session" set "created_at" = now() - ${age}::interval where "user_id" = ${userId}`,
  );
}

beforeAll(async () => {
  if (!available) return;
  // Never send real email from a test run, whatever the local env holds.
  delete process.env["CANDIDLENS_SMTP_USER"];
  delete process.env["CANDIDLENS_SMTP_PASSWORD"];
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });
  // The daily email caps are shared by everything that signed up in the
  // last 24 hours on this database; start these tests with room to send.
  await db.execute(sql`delete from "verification" where "identifier" like 'email-sent-day:%'`);
});

afterAll(async () => {
  if (!available) return;
  for (const id of orgs) {
    const left = await count(sql`select count(*) as n from "organization" where "id" = ${id}`);
    if (left > 0) await deleteOrgCompletely(db, id);
  }
  for (const id of users) await db.execute(sql`delete from "user" where "id" = ${id}`);
  await db.execute(
    sql`delete from "verification" where "identifier" like ${`email-sent:%:life-%-${STAMP}@example.com`}`,
  );
});

describe.skipIf(!available && allowSkip)("change email", () => {
  it("emails the new address and changes it once the owner confirms", async () => {
    const user = await signUp("change");
    const newEmail = `life-changed-${STAMP}@example.com`;
    const res = await post("/api/account/email", user.cookie, { newEmail });
    expect(res.status).toBe(200);
    const token = changeToken(newEmail);
    // Nothing changes until the confirmation.
    expect((await userRow(user.id))?.email).toBe(user.email);

    const pending = await app.request("/api/account/email/pending", {
      headers: { cookie: user.cookie },
    });
    expect(((await pending.json()) as { newEmail: string }).newEmail).toBe(newEmail);

    const confirm = await post("/api/account/email/confirm", user.cookie, { token });
    expect(confirm.status).toBe(200);
    const row = await userRow(user.id);
    expect(row?.email).toBe(newEmail);
    expect(row?.email_verified).toBe(true);
    expect(lastMail(user.email, "Your CandidLens email was changed")).toBeDefined();

    const signIn = await auth.api.signInEmail({ body: { email: newEmail, password: PASSWORD } });
    expect(signIn.user.id).toBe(user.id);
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: PASSWORD } }),
    ).rejects.toThrow();

    const again = await post("/api/account/email/confirm", user.cookie, { token });
    expect(again.status).toBe(400);
    expect(await errorOf(again)).toBe("invalid_token");
  });

  it("cancels reset links that were sent to the old address", async () => {
    const user = await signUp("reset-then-change");
    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: `${WEB}/reset-password` },
    });
    const resetMail = lastMail(user.email, "Reset your CandidLens password");
    const resetToken = new URL(resetMail?.text.match(/https?:\/\/\S+/)?.[0] ?? "http://x/").pathname
      .split("/")
      .at(-1);
    expect(resetToken).toBeTruthy();

    const newEmail = `life-reset-new-${STAMP}@example.com`;
    await post("/api/account/email", user.cookie, { newEmail });
    const confirm = await post("/api/account/email/confirm", user.cookie, {
      token: changeToken(newEmail),
    });
    expect(confirm.status).toBe(200);

    await expect(
      auth.api.resetPassword({
        body: { newPassword: "Taken-Back-Passw0rd!1", token: resetToken ?? "" },
      }),
    ).rejects.toThrow();
  });

  it("accepts the link only from the account that asked for it", async () => {
    const owner = await signUp("asker");
    const other = await signUp("other");
    const newEmail = `life-asker-new-${STAMP}@example.com`;
    await post("/api/account/email", owner.cookie, { newEmail });
    const token = changeToken(newEmail);

    const res = await post("/api/account/email/confirm", other.cookie, { token });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("invalid_token");
    expect((await userRow(owner.id))?.email).toBe(owner.email);
    expect((await userRow(other.id))?.email).toBe(other.email);
  });

  it("refuses an email another account uses, or the same email", async () => {
    const user = await signUp("refusals");
    const taken = await signUp("taken");

    const inUse = await post("/api/account/email", user.cookie, { newEmail: taken.email });
    expect(inUse.status).toBe(409);
    expect(await errorOf(inUse)).toBe("email_in_use");

    const same = await post("/api/account/email", user.cookie, { newEmail: user.email });
    expect(same.status).toBe(400);
    expect(await errorOf(same)).toBe("same_email");
  });

  it("refuses an unknown origin and an old sign-in", async () => {
    const user = await signUp("origin");
    const noOrigin = await post(
      "/api/account/email",
      user.cookie,
      { newEmail: `life-x-${STAMP}@example.com` },
      "https://evil.example",
    );
    expect(noOrigin.status).toBe(400);
    expect(await errorOf(noOrigin)).toBe("bad_origin");

    await setSignInAge(user.id, "20 minutes");
    const stale = await post("/api/account/email", user.cookie, {
      newEmail: `life-y-${STAMP}@example.com`,
    });
    expect(stale.status).toBe(403);
    expect(await errorOf(stale)).toBe("session_not_fresh");
  });
});

describe.skipIf(!available && allowSkip)("delete account", () => {
  it("scrubs an account without organizations and frees its email", async () => {
    const user = await signUp("solo");
    // Someone who knows the id signs up with the address a predictable
    // scrub would use; the deletion must still go through.
    const squatter = await auth.api.signUpEmail({
      body: { name: "Squatter", email: `deleted-${user.id}@deleted.invalid`, password: PASSWORD },
    });
    users.push(squatter.user.id);

    const res = await post("/api/account/delete", user.cookie, { confirmEmail: user.email });
    expect(res.status).toBe(200);

    const row = await userRow(user.id);
    expect(row?.name).toBe("Deleted user");
    expect(row?.email).toMatch(/^deleted-[0-9a-f-]{36}@deleted\.invalid$/);
    expect(await count(sql`select count(*) as n from "account" where "user_id" = ${user.id}`)).toBe(
      0,
    );
    expect(await auth.api.getSession({ headers: new Headers({ cookie: user.cookie }) })).toBeNull();
    await expect(
      auth.api.signInEmail({ body: { email: user.email, password: PASSWORD } }),
    ).rejects.toThrow();

    // The address is free for a new account.
    const again = await auth.api.signUpEmail({
      body: { name: "Again", email: user.email, password: PASSWORD },
    });
    users.push(again.user.id);
    expect(again.user.id).not.toBe(user.id);
  });

  it("needs the email typed back and a recent sign-in", async () => {
    const user = await signUp("guarded");
    const wrong = await post("/api/account/delete", user.cookie, {
      confirmEmail: "someone@example.com",
    });
    expect(wrong.status).toBe(400);
    expect(await errorOf(wrong)).toBe("confirm_mismatch");

    await setSignInAge(user.id, "20 minutes");
    const stale = await post("/api/account/delete", user.cookie, { confirmEmail: user.email });
    expect(stale.status).toBe(403);
    expect(await errorOf(stale)).toBe("session_not_fresh");
    expect((await userRow(user.id))?.email).toBe(user.email);
  });

  it("erases an organization only you belong to, with its jobs and audit log", async () => {
    const user = await signUp("eraser");
    const orgId = await createOrg(user, "eraser");
    await auth.api.setActiveOrganization({
      body: { organizationId: orgId },
      headers: new Headers({ cookie: user.cookie }),
    });
    // A real job, and an audit entry, both erased with the org.
    const job = await post("/api/jobs", user.cookie, {
      title: "Eraser job",
      description: "Erased with the account.",
    });
    expect(job.status).toBe(201);
    await appendAudit(db, {
      orgId,
      actorId: user.id,
      action: "job.created",
      payload: { jobId: "j1" },
    });

    const plan = await app.request("/api/account/deletion", { headers: { cookie: user.cookie } });
    expect(
      ((await plan.json()) as { erase: Array<{ id: string }> }).erase.map((o) => o.id),
    ).toEqual([orgId]);

    const res = await post("/api/account/delete", user.cookie, { confirmEmail: user.email });
    expect(res.status).toBe(200);
    expect(await count(sql`select count(*) as n from "organization" where "id" = ${orgId}`)).toBe(
      0,
    );
    expect(await count(sql`select count(*) as n from "audit_log" where "org_id" = ${orgId}`)).toBe(
      0,
    );
    expect(await count(sql`select count(*) as n from "jobs" where "org_id" = ${orgId}`)).toBe(0);
  });

  it("asks the only owner of a shared organization to hand it over first", async () => {
    const owner = await signUp("owner");
    const teammate = await signUp("teammate");
    const orgId = await createOrg(owner, "shared");
    await addMember(orgId, teammate.id, "recruiter");
    await appendAudit(db, {
      orgId,
      actorId: owner.id,
      action: "job.created",
      payload: { jobId: "j2" },
    });

    const blocked = await post("/api/account/delete", owner.cookie, { confirmEmail: owner.email });
    expect(blocked.status).toBe(409);
    const body = (await blocked.json()) as { error: string; orgs: Array<{ id: string }> };
    expect(body.error).toBe("hand_over_ownership");
    expect(body.orgs.map((o) => o.id)).toEqual([orgId]);
    expect((await userRow(owner.id))?.email).toBe(owner.email);

    // Once the teammate is an owner too, the owner can leave.
    await db.execute(
      sql`update "member" set "role" = 'owner' where "organization_id" = ${orgId} and "user_id" = ${teammate.id}`,
    );
    const res = await post("/api/account/delete", owner.cookie, { confirmEmail: owner.email });
    expect(res.status).toBe(200);

    expect(await count(sql`select count(*) as n from "organization" where "id" = ${orgId}`)).toBe(
      1,
    );
    expect(
      await count(
        sql`select count(*) as n from "member" where "organization_id" = ${orgId} and "user_id" = ${owner.id}`,
      ),
    ).toBe(0);
    // The shared audit log keeps every entry, records the departure, and
    // still verifies end to end.
    expect(
      await count(
        sql`select count(*) as n from "audit_log" where "org_id" = ${orgId} and "action" = 'member.account_deleted' and "actor_id" = ${owner.id}`,
      ),
    ).toBe(1);
    expect(await chainIntact(orgId)).toBe(true);
  });

  it("lets a member who isn't the only owner leave, and revokes their API tokens", async () => {
    const owner = await signUp("keeper");
    const leaver = await signUp("leaver");
    const orgId = await createOrg(owner, "kept");
    await addMember(orgId, leaver.id, "recruiter");
    await db.execute(
      sql`insert into "api_tokens" ("org_id", "token_hash", "last4", "label", "created_by")
          values (${orgId}, ${`hash-${STAMP}-leaver`}, 'abcd', 'Leaver token', ${leaver.id})`,
    );

    const res = await post("/api/account/delete", leaver.cookie, { confirmEmail: leaver.email });
    expect(res.status).toBe(200);
    expect(
      await count(
        sql`select count(*) as n from "member" where "organization_id" = ${orgId} and "user_id" = ${leaver.id}`,
      ),
    ).toBe(0);
    expect(
      await count(
        sql`select count(*) as n from "api_tokens" where "created_by" = ${leaver.id} and "revoked_at" is null`,
      ),
    ).toBe(0);
    expect(await count(sql`select count(*) as n from "organization" where "id" = ${orgId}`)).toBe(
      1,
    );
  });

  it("never leaves an organization without an owner when co-owners delete at once", async () => {
    const first = await signUp("co-one");
    const second = await signUp("co-two");
    const third = await signUp("co-member");
    const orgId = await createOrg(first, "co-owned");
    await addMember(orgId, second.id, "owner");
    await addMember(orgId, third.id, "viewer");

    // Hold the organization while both deletions start, so they overlap
    // for certain, then let go: each must wait, and the second must see
    // what the first did.
    let pending: Promise<Response[]> = Promise.resolve([]);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from "organization" where "id" = ${orgId} for update`);
      pending = Promise.all([
        post("/api/account/delete", first.cookie, { confirmEmail: first.email }),
        post("/api/account/delete", second.cookie, { confirmEmail: second.email }),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    const results = await pending;
    // One leaves; the other is then the only owner and must hand over first.
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await count(
        sql`select count(*) as n from "member" where "organization_id" = ${orgId} and "role" = 'owner'`,
      ),
    ).toBe(1);
  });
});
