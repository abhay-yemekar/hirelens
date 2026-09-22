/**
 * Scheduled bias-audit snapshot tests (v1.2): manual trigger, trend read,
 * and the cron endpoint's fail-closed secret handling. Skips unless
 * DATABASE_URL is set (never skips on CI).
 */

import { createMockModel } from "@hirelens/core";
import { auth, createDb, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let db: ReturnType<typeof createDb>;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";
const STAMP = Date.now();

const RESUME = "JORDAN AVERY\njordan.avery@example.com\n\nSKILLS\nTypeScript, PostgreSQL\n";

const LEVELS = [0, 1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
}));

function rubricJson() {
  return {
    version: 1,
    key: "snapshot-eng",
    title: "Snapshot Engineer",
    criteria: ["c1", "c2", "c3", "c4", "c5"].map((key) => ({
      key,
      title: key,
      weight: 1,
      scale: LEVELS,
      doNotUse: [],
    })),
    exclusions: [],
  };
}

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  const { model } = createMockModel({
    args: {
      criteria: ["c1", "c2", "c3", "c4", "c5"].map((key) => ({
        key,
        score: 3,
        confidence: 0.8,
        rationale: `Solid on ${key}.`,
        quote: "",
      })),
    },
  });
  process.env["CRON_SECRET"] = `test-cron-${STAMP}`;
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Snapshot Tester",
      email: `snapshots-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Snapshot Org", slug: `snapshots-${STAMP}` },
    headers: new Headers({ cookie }),
  });
  orgId = org.id;
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: new Headers({ cookie }),
  });
});

afterAll(async () => {
  if (!available || orgId === "") return;
  delete process.env["CRON_SECRET"];
  await createDb(DATABASE_URL).delete(organization).where(eq(organization.id, orgId));
});

describe.skipIf(!available && allowSkip)("scheduled audit snapshots", () => {
  let jobId = "";
  let candidateId = "";

  it("sets up a job with a decided candidate", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Snapshot Job", description: "Snapshot trend job." }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    await app.request(`/api/jobs/${jobId}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    const up = await app.request(`/api/jobs/${jobId}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    candidateId = ((await up.json()) as { candidateId: string }).candidateId;
    await app.request(`/api/jobs/${jobId}/score`, { method: "POST", headers: authHeaders });
    const decision = await app.request(`/api/jobs/${jobId}/decisions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ candidateId, stage: "shortlisted", reason: "Solid match" }),
    });
    expect(decision.status).toBe(201);
  });

  it("takes a manual snapshot and returns the trend", async () => {
    const take = await app.request(`/api/jobs/${jobId}/audit-snapshots`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ dimension: "gender" }),
    });
    expect(take.status).toBe(201);
    const takeBody = (await take.json()) as { ok: boolean; allPass: boolean };
    expect(takeBody.allPass).toBe(true);

    const trend = await app.request(`/api/jobs/${jobId}/audit-snapshots`, { headers: authHeaders });
    expect(trend.status).toBe(200);
    const trendBody = (await trend.json()) as {
      snapshots: Array<{ dimension: string; trigger: string; allPass: string }>;
    };
    expect(trendBody.snapshots.length).toBe(1);
    expect(trendBody.snapshots[0]?.dimension).toBe("gender");
    expect(trendBody.snapshots[0]?.trigger).toBe("manual");
  });

  it("cron endpoint fails closed without/with a wrong secret", async () => {
    const noAuth = await app.request("/api/cron/audit-snapshots", { method: "POST" });
    expect(noAuth.status).toBe(401);

    const badAuth = await app.request("/api/cron/audit-snapshots", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    expect(badAuth.status).toBe(401);
  });

  it("cron endpoint snapshots every job with the right secret", async () => {
    const cron = await app.request("/api/cron/audit-snapshots", {
      method: "POST",
      headers: { authorization: `Bearer test-cron-${STAMP}` },
    });
    expect(cron.status).toBe(200);
    const body = (await cron.json()) as { snapshots: number; results: Array<{ jobId: string }> };
    expect(body.snapshots).toBeGreaterThanOrEqual(4); // 4 dimensions × ≥1 job
    // Our job appears with all four dimensions (the dev DB may hold other
    // orgs' jobs too — cron covers everything).

    // Trend now shows scheduled rows too.
    const trend = await app.request(`/api/jobs/${jobId}/audit-snapshots`, { headers: authHeaders });
    const trendBody = (await trend.json()) as { snapshots: Array<{ trigger: string }> };
    expect(trendBody.snapshots.some((s) => s.trigger === "scheduled")).toBe(true);
  });
});
