/**
 * Read-model integration tests: candidate list/detail and run detail
 * (per-candidate overall, criterion scores + evidence spans) — the
 * endpoints the product UI consumes. Skips unless DATABASE_URL is set.
 */

import { createMockModel } from "@hirelens/core";
import { auth, createDb, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;

let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();
const QUOTE = "Built event-driven services in TypeScript on Node.js";

const RESUME = [
  "JORDAN AVERY",
  "Senior Backend Engineer - jordan.avery@example.com",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
  `- ${QUOTE} handling 40k req/s.`,
  "",
  "SKILLS",
  "TypeScript, Node.js, PostgreSQL, Kubernetes",
].join("\n");

const RESUME_2 = `${RESUME}\n\nAlso mentored two junior engineers.\n`;

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
  const db = createDb(DATABASE_URL);
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
      name: "Read Model Tester",
      email: `readmodel-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Read Model Org", slug: `readmodel-${STAMP}` },
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

describe.skipIf(!available)("read models", () => {
  it("serves candidate list, detail, and run detail for the UI", async () => {
    // Setup: job → rubric → two uploads → score.
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Read Job", description: "Read-model test job." }),
    });
    expect(jobRes.status).toBe(201);
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const rubricRes = await app.request(`/api/jobs/${job.id}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    expect(rubricRes.status).toBe(201);

    const form1 = new FormData();
    form1.append("file", new File([RESUME], "jordan1.txt", { type: "text/plain" }));
    const up1 = await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form1,
    });
    expect(up1.status).toBe(201);

    const form2 = new FormData();
    form2.append("file", new File([RESUME_2], "jordan2.txt", { type: "text/plain" }));
    const up2 = await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form2,
    });
    expect(up2.status).toBe(201);

    const scoreRes = await app.request(`/api/jobs/${job.id}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(scoreRes.status).toBe(200);
    const { summary } = (await scoreRes.json()) as {
      summary: { runId: string; scored: number };
    };
    expect(summary.scored).toBe(2);

    // --- Candidate list: 2 rows, no raw text leaked. ---
    const listRes = await app.request(`/api/jobs/${job.id}/candidates`, { headers: authHeaders });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      candidates: Array<{ id: string; language: string | null; sourceFileKey: string | null }>;
    };
    expect(list.candidates).toHaveLength(2);
    expect(JSON.stringify(list.candidates)).not.toContain("JORDAN AVERY");

    // --- Candidate detail: documents with rawText + empty decisions. ---
    const detailRes = await app.request(
      `/api/jobs/${job.id}/candidates/${list.candidates[0]?.id}`,
      {
        headers: authHeaders,
      },
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      candidate: { id: string };
      documents: Array<{ rawText: string; pageCount: number | null }>;
      decisions: unknown[];
    };
    expect(detail.candidate.id).toBe(list.candidates[0]?.id);
    expect(detail.documents[0]?.rawText).toContain("JORDAN AVERY");
    expect(detail.decisions).toHaveLength(0);

    // --- Cross-job candidate must 404. ---
    const otherJob = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Other", description: "Other job." }),
    });
    const { job: other } = (await otherJob.json()) as { job: { id: string } };
    const cross = await app.request(`/api/jobs/${other.id}/candidates/${list.candidates[0]?.id}`, {
      headers: authHeaders,
    });
    expect(cross.status).toBe(404);

    // --- Run list then detail. ---
    const runsRes = await app.request(`/api/jobs/${job.id}/runs`, { headers: authHeaders });
    expect(runsRes.status).toBe(200);
    const runs = (await runsRes.json()) as { runs: Array<{ id: string; status: string }> };
    expect(runs.runs[0]?.status).toBe("completed");

    const runRes = await app.request(`/api/jobs/${job.id}/runs/${summary.runId}`, {
      headers: authHeaders,
    });
    expect(runRes.status).toBe(200);
    const run = (await runRes.json()) as {
      run: { id: string; rubricVersion: number };
      candidates: Array<{
        candidateId: string;
        overall: number;
        criteria: Array<{
          criterionKey: string;
          score: number;
          evidence: Array<{ startOffset: number; endOffset: number; quotedText: string }>;
        }>;
      }>;
    };
    expect(run.run.id).toBe(summary.runId);
    expect(run.candidates).toHaveLength(2);
    for (const c of run.candidates) {
      expect(c.criteria).toHaveLength(5);
      // Equal weights, all 3s → overall = 3/5 * 100 = 60.
      expect(c.overall).toBeCloseTo(60, 0);
      const evidenceRows = c.criteria.flatMap((s) => s.evidence);
      for (const e of evidenceRows) {
        expect(e.endOffset).toBeGreaterThan(e.startOffset);
        expect(e.quotedText.length).toBeGreaterThan(0);
      }
    }
    // Mock model scored 3 across the board; evidence only where the model quoted.
    expect(run.candidates.every((c) => c.criteria.every((s) => s.score === 3))).toBe(true);
  });
});
