/**
 * Enables required Postgres extensions on the database at DATABASE_URL.
 * Used by CI (service containers can't run init scripts without bind
 * mounts) and by self-hosters whose database was created externally.
 * docker-entrypoint-initdb.d handles this automatically in compose.
 */
import "dotenv/config";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("Extensions ensured.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
