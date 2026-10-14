/**
 * Generate the checked-in migration snapshot the API's health check
 * compares against the live drizzle.__drizzle_migrations table.
 *
 * drizzle's migrator inserts each applied migration row with
 * created_at = the journal entry's 'when' (millisecond epoch), so the
 * 'when' values identify exactly which of the journal's migrations are
 * applied. A file snapshot (not a runtime read of the folder) is used
 * because the serverless bundle cannot rely on the drizzle folder
 * shipping inside it.
 *
 * Run after every `db:generate`: pnpm --filter @hirelens/db gen:migrations
 * (output is committed).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const journal = JSON.parse(
  readFileSync(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"),
);
const entries = journal.entries.map((e) => ({ tag: e.tag, when: e.when }));
if (entries.length === 0) throw new Error("migration journal has no entries");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: drizzle/meta/_journal.json
 * Regenerate with: pnpm --filter @hirelens/db gen:migrations
 *
 * Snapshot of the migration journal at ${new Date().toISOString()}
 */
export interface MigrationSnapshotEntry {
  tag: string;
  /** Journal 'when' timestamp; the migrator uses it as the row's created_at. */
  when: number;
}

export const MIGRATION_SNAPSHOT: readonly MigrationSnapshotEntry[] = ${JSON.stringify(entries, null, 2)};
`;

mkdirSync(path.join(root, "src"), { recursive: true });
writeFileSync(path.join(root, "src", "migration-snapshot.ts"), out);
console.log(`migration-snapshot.ts written (${entries.length} entries)`);
