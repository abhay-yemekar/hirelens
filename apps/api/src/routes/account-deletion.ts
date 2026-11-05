/**
 * Deleting your own account.
 *
 * GET  /api/account/deletion  — what deleting would do, for the
 *   confirmation screen.
 * POST /api/account/delete    { confirmEmail } — needs a recent sign-in
 *   and the account's email typed back.
 *
 * Organizations, as the owner decided (#162):
 * - one where you are the only member is erased with everything in it
 *   (jobs, candidates, resumes, its audit log) through the sanctioned
 *   purge path;
 * - one with other members where you are the only owner blocks the
 *   deletion until you make someone else an owner;
 * - anything else you leave: its audit log records it, and API tokens you
 *   created there are revoked.
 *
 * The user row itself stays, scrubbed: the audit log is append-only and
 * each entry's hash covers its actor id, so deleting or blanking the id
 * would either be refused or break every shared organization's chain. The
 * id is random and means nothing on its own; the name, email, password,
 * Google/GitHub links, sessions and memberships are all removed.
 *
 * It all happens in one transaction that first locks your organizations
 * and their memberships, then works out the plan. A co-owner deleting at
 * the same moment, a role change or an accepted invitation waits and then
 * sees the result, and a failure anywhere leaves everything as it was.
 */

import { randomUUID } from "node:crypto";
import {
  account,
  apiTokens,
  invitation,
  member,
  organization,
  session,
  user,
  verification,
} from "@candidlens/db";
import { appendAuditIn, type DbTransaction, purgeOrgIn } from "@candidlens/orchestrator";
import { and, eq, inArray, isNull, like, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";
import { guardAccountRequest } from "./account-guards.js";

const DeleteSchema = z.object({ confirmEmail: z.string().min(1).max(320) }).strip();

interface OrgRef {
  id: string;
  name: string;
}

export interface DeletionPlan {
  /** Only you are in it: erased with everything in it. */
  erase: OrgRef[];
  /** Others stay and another owner remains: you leave. */
  leave: OrgRef[];
  /** Others stay and you are the only owner: hand over first. */
  handOver: OrgRef[];
}

function isOwner(role: string): boolean {
  return role
    .split(",")
    .map((r) => r.trim())
    .includes("owner");
}

export async function deletionPlan(tx: DbTransaction, userId: string): Promise<DeletionPlan> {
  const plan: DeletionPlan = { erase: [], leave: [], handOver: [] };
  const mine = await tx
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.id);
  for (const org of mine) {
    const others = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, org.id), ne(member.userId, userId)));
    const ref = { id: org.id, name: org.name };
    if (others.length === 0) plan.erase.push(ref);
    else if (isOwner(org.role) && !others.some((o) => isOwner(o.role))) plan.handOver.push(ref);
    else plan.leave.push(ref);
  }
  return plan;
}

type Outcome =
  | { status: 200; body: { ok: true } }
  | { status: 400 | 401 | 409; body: Record<string, unknown> };

async function deleteAccountIn(
  tx: DbTransaction,
  userId: string,
  confirmEmail: string,
): Promise<Outcome> {
  const [me] = await tx
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!me) return { status: 401, body: { ok: false, error: "unauthorized" } };
  if (confirmEmail.trim().toLowerCase() !== me.email.toLowerCase()) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "confirm_mismatch",
        message: "Type your account's email exactly to confirm.",
      },
    };
  }

  // Lock, in id order so two deletions can't deadlock: the organizations
  // (an accepted invitation's insert waits on this through its foreign
  // key) and every membership in them (role changes and other deletions
  // wait too). Then plan with what is committed.
  const orgIds = (
    await tx.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId))
  )
    .map((r) => r.id)
    .sort();
  if (orgIds.length > 0) {
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(inArray(organization.id, orgIds))
      .orderBy(organization.id)
      .for("update");
    await tx
      .select({ id: member.id })
      .from(member)
      .where(inArray(member.organizationId, orgIds))
      .orderBy(member.id)
      .for("update");
  }
  const plan = await deletionPlan(tx, userId);
  if (plan.handOver.length > 0) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "hand_over_ownership",
        message:
          "You're the only owner of an organization that has other members. Make one of them an owner first.",
        orgs: plan.handOver,
      },
    };
  }

  for (const org of plan.leave) {
    // Recorded while you are still a member; the entry carries no personal data.
    await appendAuditIn(tx, {
      orgId: org.id,
      actorId: userId,
      action: "member.account_deleted",
      payload: {},
    });
    await tx
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiTokens.orgId, org.id),
          eq(apiTokens.createdBy, userId),
          isNull(apiTokens.revokedAt),
        ),
      );
  }
  // Organizations only you belong to go with the account; the org delete
  // cascades to jobs, candidates, settings, tokens and invitations.
  for (const org of plan.erase) {
    await purgeOrgIn(tx, org.id);
    await tx.delete(organization).where(eq(organization.id, org.id));
  }

  await tx.delete(member).where(eq(member.userId, userId));
  await tx
    .delete(invitation)
    .where(and(eq(invitation.email, me.email), eq(invitation.status, "pending")));
  await tx.delete(account).where(eq(account.userId, userId));
  await tx.delete(session).where(eq(session.userId, userId));
  await tx
    .delete(verification)
    .where(
      or(
        eq(verification.identifier, `change-email:${userId}`),
        and(like(verification.identifier, "reset-password:%"), eq(verification.value, userId)),
      ),
    );
  await tx
    .update(user)
    .set({
      name: "Deleted user",
      // Unique, undeliverable and unguessable (nobody can sign up with it
      // first and make the scrub fail), and it frees the real address.
      email: `deleted-${randomUUID()}@deleted.invalid`,
      emailVerified: false,
      image: null,
      track: null,
    })
    .where(eq(user.id, userId));
  return { status: 200, body: { ok: true } };
}

export function accountDeletionRoutes() {
  const routes = new Hono<AppEnv>();

  routes.get("/account/deletion", async (c) => {
    const userId = c.get("session")?.user?.id;
    if (!userId) return c.json({ ok: false, error: "unauthorized" }, 401);
    const plan = await c.get("db").transaction((tx) => deletionPlan(tx, userId));
    return c.json({ ok: true, ...plan });
  });

  routes.post("/account/delete", async (c) => {
    const guard = guardAccountRequest(c, "delete your account");
    if ("refused" in guard) return guard.refused;
    const parsed = DeleteSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json({ ok: false, error: "invalid_body" }, 400);

    const outcome = await c
      .get("db")
      .transaction((tx) => deleteAccountIn(tx, guard.userId, parsed.data.confirmEmail));
    return c.json(outcome.body, outcome.status);
  });

  return routes;
}
