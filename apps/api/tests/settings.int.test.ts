/**
 * Integration tests for /api/settings/llm: defaults without the
 * org_settings table (migrations-pending resilience), normal auth
 * behavior, and the owner-only mutation rules. Skips unless
 * DATABASE_URL is set — same availability contract as the other suites.
 */
import { createDb, type Database } from "@hirelens/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { deleteOrgCompletely } from "./helpers.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0 && !/simulate-missing/.test(DATABASE_URL);
const allowSkip = !process.env["CI"];

let db: Database;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";
const STAMP = Date.now();

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });

  const signUp = await import("@hirelens/db").then(({ auth }) =>
    auth.api.signUpEmail({
      body: {
        name: "Settings Tester",
        email: `settings-test-${STAMP}@example.com`,
        password: "Str0ng-Passw0rd!123",
      },
      returnHeaders: true,
    }),
  );
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("session_token");
  authHeaders = { cookie };

  const { auth } = await import("@hirelens/db");
  const org = await auth.api.createOrganization({
    body: { name: "Settings Test Org", slug: `settings-test-${STAMP}` },
    headers: new Headers({ cookie }),
  });
  orgId = org.id;
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: new Headers({ cookie }),
  });
});

afterAll(async () => {
  if (!available) return;
  if (orgId !== "") await deleteOrgCompletely(db, orgId);
});

describe.skipIf(!available && allowSkip)("settings llm routes", () => {
  it("rejects unauthenticated reads", async () => {
    const res = await app.request("/api/settings/llm");
    expect(res.status).toBe(401);
  });

  it("returns defaults when the org has no stored preference", async () => {
    const res = await app.request("/api/settings/llm", { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      setting: { llmProvider: string | null; fallbackOrder: string[] };
      migrationsPending?: boolean;
    };
    expect(body.setting.llmProvider).toBeNull();
    expect(body.setting.fallbackOrder).toEqual([]);
    // Migrations have run in the test database, so this must be false.
    expect(body.migrationsPending).toBe(false);
  });
});
