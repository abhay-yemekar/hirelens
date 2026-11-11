import { auth, type Database, organization } from "@candidlens/db";
import { purgeOrgIn } from "@candidlens/orchestrator";
import { eq } from "drizzle-orm";

/**
 * Test teardown for an org that wrote audit rows: the audit_log table is
 * append-only with an ON DELETE RESTRICT org FK, so erasure goes through
 * the sanctioned purge helper first; the org delete then cascades the
 * remaining rows (jobs, candidates, rubrics, ...).
 *
 * Purge and delete share one transaction (#123). Test files run in
 * parallel on one database, and the snapshots test's cron sweep appends
 * audit rows for every org's jobs, so a row committed between a separate
 * purge and delete made the delete fail. purgeOrgIn's ALTER TABLE holds a
 * lock that makes every audit insert wait until this commits; a late one
 * then fails on the FK, which the cron skips. Do not lock the org row
 * first: an insert holds its audit_log lock while waiting on that row, so
 * the two deadlock.
 */
export async function deleteOrgCompletely(db: Database, orgId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await purgeOrgIn(tx, orgId);
    await tx.delete(organization).where(eq(organization.id, orgId));
  });
}

type RequestableApp = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

/**
 * A second, unrelated tenant for cross-org tests: its own user, active org,
 * and one job. Tear it down with deleteOrgCompletely(db, other.orgId).
 */
export async function createOtherTenant(
  app: RequestableApp,
  label: string,
): Promise<{ orgId: string; headers: Record<string, string>; jobId: string }> {
  const stamp = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signUp = await auth.api.signUpEmail({
    body: { name: "Other Tenant", email: `${stamp}@example.com`, password: "Str0ng-Passw0rd!123" },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  const org = await auth.api.createOrganization({
    body: { name: "Other Tenant Org", slug: stamp },
    headers: new Headers({ cookie }),
  });
  await auth.api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: new Headers({ cookie }),
  });
  const headers = { cookie };
  const jobRes = await app.request("/api/jobs", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      title: "Other tenant job",
      description: "Cross-tenant isolation test.",
    }),
  });
  const jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;
  return { orgId: org.id, headers, jobId };
}
