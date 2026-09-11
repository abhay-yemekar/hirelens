/**
 * Review workflow integration tests: decisions (stage + reason, audit),
 * score overrides, ranked review table, and blind-review masking.
 * Skips unless DATABASE_URL is set.
 */

import { createMockModel } from "@hirelens/core";
import { auditLog, auth, createDb, organization } from "@hirelens/db";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;

let db: ReturnType<typeof createDb>;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();
const NAME = "JORDAN AVERY";

const RESUME = [
  "JORDAN AVERY",
  "Senior Backend Engineer - jordan.avery@example.com - +1 415 555 0100",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
  "",
  "SKILLS",
  "TypeScript, Node.js, PostgreSQL, Kubernetes",
].join("\n");

const LEVELS = [0, 1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
}));

function rubricJson() {
  return {
    version: 1,
    key: "backend-eng",
    title: "Backend Engineer",
    criteria: ["system-design", "databases", "testing", "ops", "communication"].map((key) => ({
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
      criteria: ["system-design", "databases", "testing", "ops", "communication"].map((key) => ({
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
      name: "Review Tester",
      email: `review-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Review Org", slug: `review-${STAMP}` },
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

describe.skipIf(!available)("review workflow", () => {
  let jobId = "";
  let candidateId = "";
  let scoreId = "";

  it("sets up job, rubric, candidate, and a completed run", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Review Job", description: "Review workflow job." }),
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
    candidateId = ((await up.json()) as { candidateId: string }).candidateId;

    const score = await app.request(`/api/jobs/${jobId}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(score.status).toBe(200);
    const { summary } = (await score.json()) as { summary: { scored: number } };
    expect(summary.scored).toBe(1);

    const runDetail = await app.request(`/api/jobs/${jobId}/runs`, { headers: authHeaders });
    const { runs } = (await runDetail.json()) as { runs: Array<{ id: string }> };
    const detail = await app.request(`/api/jobs/${jobId}/runs/${runs[0]?.id}`, {
      headers: authHeaders,
    });
    const body = (await detail.json()) as {
      candidates: Array<{ candidateId: string; criteria: Array<{ id: string }> }>;
    };
    candidateId = body.candidates[0]?.candidateId ?? candidateId;
    scoreId = body.candidates[0]?.criteria[0]?.id ?? "";
    expect(scoreId).not.toBe("");
  });

  it("rejects a decision without a reason and accepts a valid one", async () => {
    const bad = await app.request(`/api/jobs/${jobId}/decisions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ candidateId, stage: "shortlisted", reason: "" }),
    });
    expect(bad.status).toBe(400);

    const good = await app.request(`/api/jobs/${jobId}/decisions`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        candidateId,
        stage: "shortlisted",
        reason: "Strong ops evidence, Kubernetes migration lead.",
      }),
    });
    expect(good.status).toBe(201);

    // Audit log recorded the decision.
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    expect(entry?.action).toBe("decision.recorded");
  });

  it("overrides a score and records author + reason", async () => {
    const res = await app.request(`/api/jobs/${jobId}/scores/${scoreId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ score: 5, reason: "Verified project depth in follow-up notes." }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { score: { score: number } };
    expect(body.score.score).toBe(5);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    expect(entry?.action).toBe("score.overridden");

    const invalid = await app.request(`/api/jobs/${jobId}/scores/${scoreId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ score: 9, reason: "out of range" }),
    });
    expect(invalid.status).toBe(400);
  });

  it("returns the ranked review table with stage + overrides", async () => {
    const res = await app.request(`/api/jobs/${jobId}/review`, { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      review: Array<{ candidateId: string; overall: number; stage: string; overridden: number }>;
    };
    expect(body.review).toHaveLength(1);
    const row = body.review[0];
    expect(row?.candidateId).toBe(candidateId);
    expect(row?.stage).toBe("shortlisted");
    expect(row?.overridden).toBe(1);
    // 4 criteria at 3 + one overridden to 5, equal weights → 17/25 * 100 = 68
    expect(row?.overall).toBeCloseTo(((4 * 3 + 5) / 25) * 100, 0);
  });

  it("masks identity cues in blind view while keeping offsets aligned", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}?blind=1`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { documents: Array<{ rawText: string }> };
    const blind = body.documents[0]?.rawText ?? "";

    expect(blind).not.toContain(NAME);
    expect(blind).not.toContain("jordan.avery@example.com");
    expect(blind).not.toContain("415 555 0100");
    expect(blind).toContain("Kubernetes, cutting deploy time 80%.");
    // Offsets preserved: same length as the unmasked text.
    expect(blind.length).toBe(RESUME.length);
  });
});
