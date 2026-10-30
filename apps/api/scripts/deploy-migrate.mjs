/**
 * Deploy-time migration step: run drizzle migrations against the target
 * database when one is configured, before the web build ships.
 *
 * Why: prod migrations were manual — CI's db:migrate targets the CI test
 * database only, and un-run migrations are exactly how prod ended up
 * partially behind while the old health check still reported healthy.
 * Migrating in the build is idempotent (drizzle skips journaled
 * migrations) and fails the deploy loudly when the schema can't be
 * brought current.
 *
 * Skips cleanly when DATABASE_URL is unset (branch builds without env)
 * or pointing at the local compose dev default, so `pnpm dev`/`pnpm
 * build` on a fresh checkout stays a no-op.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { migrationSkipReason } from "./deploy-migrate-policy.mjs";

const skip = migrationSkipReason(process.env);
if (skip !== null) {
  console.log(`deploy-migrate: ${skip} — skipping migrations`);
  process.exit(0);
}

const dbRoot = path.resolve(
  new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "../../packages/db",
);

try {
  execFileSync("pnpm", ["exec", "tsx", "src/migrate.ts"], {
    cwd: dbRoot,
    stdio: "inherit",
    env: { ...process.env }, // DATABASE_URL flows through
  });
  console.log("deploy-migrate: migrations applied");
} catch (err) {
  console.error(
    "deploy-migrate: migration step FAILED — deploy must not ship a stale schema ",
    err,
  );
  process.exit(1);
}
