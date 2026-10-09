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

import { auditLog, type Database } from "@hirelens/db";
import { eq, sql } from "drizzle-orm";

export async function purgeOrg(db: Database, orgId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update`);
    await tx.execute(sql`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete`);
    try {
      await tx.delete(auditLog).where(eq(auditLog.orgId, orgId));
    } finally {
      await tx.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update`);
      await tx.execute(sql`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete`);
    }
  });
}
