/**
 * Audit writer: appends hash-chained records to the audit_log table.
 * The linkage hash covers (actorId, action, payload, prevHash, createdAt) —
 * seq comes from the DB sequence and must not enter the hash, or persisted
 * rows could never be verified. prevHash is the current head of the org's
 * chain.
 *
 * Concurrency: the head read + insert run inside one transaction holding
 * pg_advisory_xact_lock(hashtext(orgId)), so two writers (across processes
 * or serverless instances) can never read the same head. A unique
 * (org_id, prev_hash) index is the database-level backstop: if the lock
 * were somehow bypassed, the second commit fails instead of forking.
 */

import { hashLink } from "@hirelens/core";
import { auditLog, type Database } from "@hirelens/db";
import { desc, eq, sql } from "drizzle-orm";

export interface AuditEntryInput {
  orgId: string;
  actorId?: string | undefined;
  action: string;
  payload: Record<string, unknown>;
}

/** Append one hash-chained audit record. Returns the stored row's seq and hash. */
export async function appendAudit(
  db: Database,
  entry: AuditEntryInput,
): Promise<{ seq: number; hash: string }> {
  return db.transaction(async (tx) => {
    // Per-org write lock: serializes head reads + inserts across ALL
    // processes touching this database, not just this one.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${entry.orgId}))`);

    const [head] = await tx
      .select({ hash: auditLog.hash })
      .from(auditLog)
      .where(eq(auditLog.orgId, entry.orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    const prevHash = head?.hash ?? GENESIS;
    const createdAt = new Date();
    const hash = hashLink({
      actorId: entry.actorId ?? null,
      action: entry.action,
      payload: entry.payload,
      prevHash,
      createdAt,
    });

    const [row] = await tx
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
  });
}

/** Genesis hash for an empty chain (mirrors @hirelens/core). */
const GENESIS = "0".repeat(64);
