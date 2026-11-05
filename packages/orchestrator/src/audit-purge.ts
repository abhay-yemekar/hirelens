/**
 * Sanctioned audit erasure. The audit_log table is append-only (triggers
 * reject UPDATE/DELETE) and its org FK is ON DELETE RESTRICT, so an audit
 * trail cannot be silently erased — including via org-delete cascades.
 *
 * The one legitimate way to remove audit rows is this helper: a single
 * transaction that disables the append-only triggers for the statement
 * (table-owner privilege), deletes the org's rows, and re-enables them.
 * Use for GDPR/DPDP erasure requests or test teardown — never for
 * "fixing" history.
 */

import { auditLog, type Database } from "@candidlens/db";
import { eq, sql } from "drizzle-orm";
import type { DbTransaction } from "./audit.js";

export async function purgeOrg(db: Database, orgId: string): Promise<void> {
  await db.transaction((tx) => purgeOrgIn(tx, orgId));
}

/**
 * purgeOrg inside a transaction the caller already holds (deleting an
 * account erases its only-member organizations this way, atomically with
 * the rest). Disabling the triggers is part of the transaction, so other
 * sessions never see them off; if anything fails, it all rolls back. The
 * ALTER needs the role that owns audit_log and briefly blocks every org's
 * audit writes, so it gives up after 5 seconds instead of queueing.
 */
export async function purgeOrgIn(tx: DbTransaction, orgId: string): Promise<void> {
  await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
  await tx.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update`);
  await tx.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete`);
  await tx.delete(auditLog).where(eq(auditLog.orgId, orgId));
  await tx.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update`);
  await tx.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete`);
}
