/**
 * Migration-state comparison for the health check.
 *
 * drizzle's migrator records each applied migration with
 * created_at = the journal entry's `when` (millisecond epoch stored in a
 * bigint column), so the applied timestamp set is directly comparable to
 * the checked-in MIGRATION_SNAPSHOT. This catches every state the old
 * count(*)-only check missed — including exactly the prod incident: 11 of
 * 13 migrations applied, the latest two missing, "healthy" until the
 * first org-scoped query 500'd.
 */
import { MIGRATION_SNAPSHOT } from "@hirelens/db";

export interface MigrationState {
  /** Applied rows whose timestamp matches a journal entry. */
  applied: number;
  /** Migrations the DB is missing, newest last. */
  missing: string[];
  /** Applied rows whose timestamp matches no journal entry (manual/hand edits, foreign state). */
  unknown: number;
}

/** Pure compare so the health check logic is unit-testable without a DB. */
export function compareMigrations(appliedTimestamps: readonly number[]): MigrationState {
  const appliedSet = new Set(appliedTimestamps.map(Number));
  const missing = MIGRATION_SNAPSHOT.filter((e) => !appliedSet.has(Number(e.when))).map(
    (e) => e.tag,
  );
  const journalWhens = new Set(MIGRATION_SNAPSHOT.map((e) => Number(e.when)));
  let unknown = 0;
  for (const t of appliedTimestamps) if (!journalWhens.has(Number(t))) unknown += 1;
  return {
    applied: appliedTimestamps.length - unknown,
    missing,
    unknown,
  };
}
