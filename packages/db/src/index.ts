import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return drizzle(pool, { schema });
}

export { auth } from "../auth.config.js";
export { member, organization, user } from "../auth-schema.js";
// Checked-in journal snapshot for the API's migration-state health check.
export {
  MIGRATION_SNAPSHOT,
  type MigrationSnapshotEntry,
} from "./migration-snapshot.js";
export * from "./schema/index.js";
export { schema };
