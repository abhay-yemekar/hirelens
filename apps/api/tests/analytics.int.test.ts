/**
 * Org analytics integration tests (v1.2): aggregates reflect pipeline,
 * scores, and speed after a scored + decided candidate exists. Skips
 * unless DATABASE_URL is set (never skips on CI).
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

const RESUME = [
  "JORDAN AVERY",
  "jordan.avery@example.com",
  "",
  "SKILLS",
  "TypeScript, PostgreSQL, Docker",
].join("\n");

const LEVELS = [0, 1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
}));

function rubricJson() {
  return {
    version: 1,
    key: "analytics-eng",
    title: "Analytics Engineer",
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
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Analytics Tester",
      email: `analytics-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Analytics Org", slug: `analytics-${STAMP}` },
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
  await createDb(DATABASE_URL).delete(organization).where(eq(organization.id, orgId));
});

describe.skipIf(!available && allowSkip)("org analytics", () => {
  let jobId = "";

  it("sets up a scored candidate with a decision", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Analytics Job", description: "Analytics pipeline job." }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    const rubricRes = await app.request(`/api/jobs/${jobId}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    expect(rubricRes.status).toBe(201);

    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    const up = await app.request(`/api/jobs/${jobId}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(up.status).toBe(201);
    const candidateId = ((await up.json()) as { candidateId: string }).candidateId;

    const score = await app.request(`/api/jobs/${jobId}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(score.status).toBe(200);

    const decision = await app.request(`/api/jobs/${jobId}/decisions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ candidateId, stage: "shortlisted", reason: "Strong skills" }),
    });
    expect(decision.status).toBe(201);
  });

  it("aggregates pipeline, scores, and speed for the org", async () => {
    const res = await app.request("/api/analytics", { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      analytics: {
        jobs: { total: number };
        pipeline: Record<string, number>;
        scores: {
          avgCriterion: number | null;
          distribution: Array<{ band: string; count: number }>;
        };
        speed: { medianHoursToDecision: number | null };
        bias: { auditsRun: number };
      };
    };
    const a = body.analytics;

    expect(a.jobs.total).toBe(1);
    expect(a.pipeline["shortlisted"]).toBe(1);
    expect(a.pipeline["new"]).toBe(0);
    expect(a.scores.avgCriterion).toBe(3);
    expect(a.scores.distribution).toHaveLength(6);
    expect(a.scores.distribution[3]?.count).toBe(5); // five 3s
    // Decision happened within the test window → sub-hour, but not null.
    expect(a.speed.medianHoursToDecision).not.toBeNull();
    expect(a.bias.auditsRun).toBe(0); // no audit run yet
  });

  it("is empty-but-valid for an org with no activity", async () => {
    // Second org via a second user.
    const signUp = await auth.api.signUpEmail({
      body: {
        name: "Empty Tester",
        email: `analytics-empty-${STAMP}@example.com`,
        password: "Str0ng-Passw0rd!123",
      },
      returnHeaders: true,
    });
    const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
    const org = await auth.api.createOrganization({
      body: { name: "Empty Org", slug: `analytics-empty-${STAMP}` },
      headers: new Headers({ cookie }),
    });
    await auth.api.setActiveOrganization({
      body: { organizationId: org.id },
      headers: new Headers({ cookie }),
    });

    const res = await app.request("/api/analytics", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      analytics: { jobs: { total: number }; pipeline: Record<string, number> };
    };
    expect(body.analytics.jobs.total).toBe(0);
    expect(body.analytics.pipeline["new"]).toBe(0);
  });
});
