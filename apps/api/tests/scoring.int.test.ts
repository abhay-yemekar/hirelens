/**
 * End-to-end scoring integration test: upload a resume through the API,
 * kick off a batch with a mock LLM, and verify the persisted scoring run,
 * per-criterion scores, and evidence spans in Postgres. Skips unless
 * DATABASE_URL is set.
 */

import { createMockModel } from "@hirelens/core";
import {
  auth,
  createDb,
  type Database,
  evidence,
  organization,
  scores,
  scoringRuns,
} from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;

let db: Database;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();
const QUOTE = "Led migration of the payments platform to Kubernetes";

const RESUME = [
  "JORDAN AVERY",
  "Senior Backend Engineer - jordan.avery@example.com",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  `- ${QUOTE}, cutting deploy time 80%.`,
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
        score: key === "system-design" ? 4 : 3,
        confidence: 0.85,
        rationale: `Solid on ${key}.`,
        quote: key === "system-design" ? QUOTE : "",
      })),
    },
  });
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Scoring Tester",
      email: `scoring-test-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Scoring Org", slug: `scoring-${STAMP}` },
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
  if (orgId !== "") await db.delete(organization).where(eq(organization.id, orgId));
});

describe.skipIf(!available)("end-to-end scoring", () => {
  it("runs upload → score → persisted evidence", async () => {
    // 1. Create a job.
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        title: "E2E Job",
        description: "Senior backend engineer.",
      }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };

    // 2. Import a rubric.
    const rubricRes = await app.request(`/api/jobs/${job.id}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    expect(rubricRes.status).toBe(201);

    // 3. Upload a resume.
    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    const uploadRes = await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(uploadRes.status).toBe(201);

    // 4. Kick off scoring.
    const scoreRes = await app.request(`/api/jobs/${job.id}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(scoreRes.status).toBe(200);
    const summary = (await scoreRes.json()) as {
      summary: { total: number; scored: number; failed: number; runId: string };
    };
    expect(summary.summary.total).toBe(1);
    expect(summary.summary.scored).toBe(1);
    expect(summary.summary.failed).toBe(0);

    // 5. Verify persisted run + scores + evidence.
    const runs = await db.select().from(scoringRuns).where(eq(scoringRuns.jobId, job.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("completed");

    const scoreRows = await db.select().from(scores).where(eq(scores.runId, summary.summary.runId));
    expect(scoreRows).toHaveLength(5);
    const byKey = new Map(scoreRows.map((s) => [s.criterionKey, s.score]));
    expect(byKey.get("system-design")).toBe(4);

    const evidenceRows = await db
      .select()
      .from(evidence)
      .innerJoin(scores, eq(scores.id, evidence.scoreId))
      .where(eq(scores.runId, summary.summary.runId));
    expect(evidenceRows).toHaveLength(1);
    const only = evidenceRows[0];
    expect(only?.evidence.quotedText).toBe(QUOTE);
    expect(only?.evidence.startOffset).toBeGreaterThanOrEqual(0);
    expect(only?.evidence.endOffset).toBeGreaterThan(only?.evidence.startOffset ?? 0);

    // 6. Run history is visible through the API.
    const runsRes = await app.request(`/api/jobs/${job.id}/runs`, { headers: authHeaders });
    expect(runsRes.status).toBe(200);
    const runsBody = (await runsRes.json()) as { runs: { id: string }[] };
    expect(runsBody.runs[0]?.id).toBe(summary.summary.runId);
  });
});
