/**
 * AI-content endpoint tests (v1.2): deterministic report for a stored
 * resume, cross-job 404, and honest level handling. Skips unless
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

const RESUME = [
  "JORDAN AVERY",
  "jordan.avery@example.com",
  "",
  "SUMMARY",
  "Results-driven and detail-oriented professional with a proven track record.",
  "Spearheaded multiple initiatives and fostered a culture of excellence.",
  "Moreover, demonstrated proficiency across modern systems.",
  "Furthermore, orchestrated improvements with unparalleled dedication.",
  "Additionally, expertly managed stakeholder relationships with keen understanding.",
  "Notably, embarked on a journey of continuous improvement.",
  "Consequently, achieved remarkable outcomes.",
  "Overall, a testament to my commitment to excellence.",
  "",
  "SKILLS",
  "TypeScript, PostgreSQL",
].join("\n");

const LEVELS = [0, 1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
}));

function rubricJson() {
  return {
    version: 1,
    key: "ai-eng",
    title: "AI Eng",
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
      name: "AI Tester",
      email: `aic-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "AI Org", slug: `aic-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("ai-content endpoint", () => {
  let jobId = "";
  let candidateId = "";

  it("sets up job and candidate", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "AI Job", description: "AI detection job." }),
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
    expect(up.status).toBe(201);
    candidateId = ((await up.json()) as { candidateId: string }).candidateId;
  });

  it("returns a deterministic report for the stored resume", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/ai-content`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      aiContent: { level: string; score: number | null; signals: unknown[]; summary: string };
    };
    expect(["low", "moderate", "notable"]).toContain(body.aiContent.level);
    expect(body.aiContent.summary.length).toBeGreaterThan(0);
    // This resume is deliberately AI-ish — expect phrase signals to fire.
    expect(body.aiContent.signals.length).toBeGreaterThan(0);

    const again = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/ai-content`, {
      headers: authHeaders,
    });
    const body2 = (await again.json()) as typeof body;
    expect(body2.aiContent.level).toBe(body.aiContent.level);
  });

  it("404s for a candidate from another job", async () => {
    const other = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Other AI Job", description: "Other." }),
    });
    const otherId = ((await other.json()) as { job: { id: string } }).job.id;
    const res = await app.request(`/api/jobs/${otherId}/candidates/${candidateId}/ai-content`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });
});
