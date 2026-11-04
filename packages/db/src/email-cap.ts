/**
 * Caps on outgoing sign-in email, counted in Better Auth's verification
 * table so they hold across server instances (Better Auth's own rate limit
 * is per visitor and kept in each instance's memory):
 *
 * - per address and kind per hour, so nobody can flood one inbox;
 * - per kind per day, so a script signing up made-up addresses can't use
 *   up the sender's daily quota (Gmail allows about 500) and stop password
 *   resets for everyone. Resets get the larger share.
 *
 * Each claim runs in a transaction holding an advisory lock for its kind,
 * so parallel requests can't all slip under a limit.
 */

import { randomUUID } from "node:crypto";
import { APIError } from "better-auth";
import { and, count, eq, inArray, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { verification } from "../auth-schema.js";

export type EmailKind = "reset" | "confirm";

export interface EmailLimits {
  perAddressPerHour: number;
  perKindPerDay: Record<EmailKind, number>;
}

export const EMAIL_LIMITS: EmailLimits = {
  perAddressPerHour: 3,
  perKindPerDay: { reset: 250, confirm: 200 },
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function refused(message: string, code: string): APIError {
  return APIError.from("TOO_MANY_REQUESTS", { message, code });
}

/**
 * Returns `claim(kind, email)`, which records one email or throws a 429
 * when a cap is reached. `prefix` keeps tests' counters apart.
 */
export function createEmailCap<TSchema extends Record<string, unknown>>(
  db: NodePgDatabase<TSchema>,
  limits: EmailLimits = EMAIL_LIMITS,
  prefix = "email-sent",
) {
  return async function claim(kind: EmailKind, email: string): Promise<void> {
    const perAddress = `${prefix}:${kind}:${email.toLowerCase()}`;
    const perDay = `${prefix}-day:${kind}`;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${perDay}))`);
      const now = new Date();
      await tx
        .delete(verification)
        .where(
          and(
            inArray(verification.identifier, [perAddress, perDay]),
            lt(verification.expiresAt, now),
          ),
        );
      const [address] = await tx
        .select({ sent: count() })
        .from(verification)
        .where(eq(verification.identifier, perAddress));
      if ((address?.sent ?? 0) >= limits.perAddressPerHour) {
        throw refused("Too many emails to this address. Try again in an hour.", "TOO_MANY_EMAILS");
      }
      const [day] = await tx
        .select({ sent: count() })
        .from(verification)
        .where(eq(verification.identifier, perDay));
      if ((day?.sent ?? 0) >= limits.perKindPerDay[kind]) {
        throw refused(
          "This server has sent its email for today. Try again tomorrow.",
          "EMAIL_QUOTA_REACHED",
        );
      }
      await tx.insert(verification).values([
        {
          id: randomUUID(),
          identifier: perAddress,
          value: "1",
          expiresAt: new Date(now.getTime() + HOUR_MS),
        },
        {
          id: randomUUID(),
          identifier: perDay,
          value: "1",
          expiresAt: new Date(now.getTime() + DAY_MS),
        },
      ]);
    });
  };
}
