import { type Database, organization } from "@hirelens/db";
import { purgeOrg } from "@hirelens/orchestrator";
import { eq } from "drizzle-orm";

/**
 * Test teardown for an org that wrote audit rows: the audit_log table is
 * append-only with an ON DELETE RESTRICT org FK, so erasure goes through
 * the sanctioned purgeOrg helper first; the org delete then cascades the
 * remaining rows (jobs, candidates, rubrics, ...).
 */
export async function deleteOrgCompletely(db: Database, orgId: string): Promise<void> {
  await purgeOrg(db, orgId);
  await db.delete(organization).where(eq(organization.id, orgId));
}
