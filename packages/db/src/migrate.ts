import "dotenv/config";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { sql } = await import("drizzle-orm");
  const { Pool } = await import("pg");

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  try {
    // pgvector is required by the chunks table. docker/init/01-extensions.sql
    // enables it on fresh compose volumes; this makes it idempotent everywhere.
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    const folder = new URL("../drizzle", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    await migrate(db, { migrationsFolder: folder });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
