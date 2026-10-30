/**
 * When a build may migrate the database behind DATABASE_URL.
 *
 * Vercel builds every PR branch as a preview. If Preview shares Production's
 * DATABASE_URL, migrating there applies a PR's unreviewed migration to the
 * live database before merge (this happened once). So preview builds only
 * migrate when MIGRATE_ON_PREVIEW=1 says previews have their own database.
 * Production, Docker and local builds behave as before.
 */

export const LOCAL_DEFAULT = "postgres://postgres:postgres@localhost:5433/hirelens";

/** Why this build must not migrate, or null when it should. */
export function migrationSkipReason(env) {
  const url = env["DATABASE_URL"]?.trim() ?? "";
  if (url === "") return "DATABASE_URL not set at build time";
  if (url === LOCAL_DEFAULT) return "local compose default database";
  if (env["VERCEL_ENV"] === "preview" && env["MIGRATE_ON_PREVIEW"] !== "1") {
    return "Vercel preview build (set MIGRATE_ON_PREVIEW=1 once previews use their own database)";
  }
  return null;
}
