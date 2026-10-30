import { describe, expect, it } from "vitest";
import { LOCAL_DEFAULT, migrationSkipReason } from "../scripts/deploy-migrate-policy.mjs";

const REMOTE = "postgres://app:secret@db.example.com:5432/hirelens";

describe("deploy-time migration policy", () => {
  it("migrates production, Docker and local builds against a real database", () => {
    expect(migrationSkipReason({ DATABASE_URL: REMOTE, VERCEL_ENV: "production" })).toBeNull();
    expect(migrationSkipReason({ DATABASE_URL: REMOTE })).toBeNull();
  });

  it("skips when there is no database or only the local compose default", () => {
    expect(migrationSkipReason({})).toMatch(/not set/);
    expect(migrationSkipReason({ DATABASE_URL: "  " })).toMatch(/not set/);
    expect(migrationSkipReason({ DATABASE_URL: LOCAL_DEFAULT })).toMatch(/local compose/);
  });

  // Regression: a PR preview build migrated the shared production database.
  it("never migrates from a Vercel preview build unless previews are opted in", () => {
    expect(migrationSkipReason({ DATABASE_URL: REMOTE, VERCEL_ENV: "preview" })).toMatch(
      /preview build/,
    );
    expect(
      migrationSkipReason({
        DATABASE_URL: REMOTE,
        VERCEL_ENV: "preview",
        MIGRATE_ON_PREVIEW: "true",
      }),
    ).toMatch(/preview build/);
    expect(
      migrationSkipReason({ DATABASE_URL: REMOTE, VERCEL_ENV: "preview", MIGRATE_ON_PREVIEW: "1" }),
    ).toBeNull();
  });
});
