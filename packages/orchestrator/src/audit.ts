/**
 * Audit writer: appends hash-chained records to the audit_log table.
 * The linkage hash covers (action, payload, prevHash, createdAt) — seq
 * comes from the DB sequence and must not enter the hash, or persisted
 * rows could never be verified. prevHash is the current head of the
 * org's chain; concurrent writers within one process are serialized
 * through a per-org promise chain to keep the head unambiguous.
 */

import { GENESIS, hashLink } from "@hirelens/core";
import { auditLog, type Database } from "@hirelens/db";
import { desc, eq } from "drizzle-orm";

export interface AuditEntryInput {
  orgId: string;
  actorId?: string | undefined;
  action: string;
  payload: Record<string, unknown>;
}

/** Per-org write serialization (per process). */
const orgLocks = new Map<string, Promise<unknown>>();

function serialize(orgId: string, fn: () => Promise<unknown>): Promise<unknown> {
  const prev = orgLocks.get(orgId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  orgLocks.set(
    orgId,
    next.catch(() => undefined),
  );
  return next;
}

/** Append one hash-chained audit record. Returns the stored row's seq and hash. */
export async function appendAudit(
  db: Database,
  entry: AuditEntryInput,
): Promise<{ seq: number; hash: string }> {
  const stored = (await serialize(entry.orgId, async () => {
    const [head] = await db
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.orgId, entry.orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const prevHash = head?.hash ?? GENESIS;
    const createdAt = new Date();
    const hash = hashLink({
      action: entry.action,
      payload: entry.payload,
      prevHash,
      createdAt,
    });

    const [row] = await db
      .insert(auditLog)
      .values({
        orgId: entry.orgId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        payload: entry.payload,
        prevHash,
        hash,
        // The hash covers this exact timestamp; the column default
        // (defaultNow) would differ from it by microseconds.
        createdAt,
      })
      .returning({ seq: auditLog.seq, hash: auditLog.hash });
    if (!row) throw new Error("audit insert returned no row");
    return { seq: row.seq, hash: row.hash };
  })) as { seq: number; hash: string };
  return stored;
}
