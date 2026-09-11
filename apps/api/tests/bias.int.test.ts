/**
 * Bias audit integration tests: demographics self-report (upsert), the
 * adverse-impact report endpoint, and the audit-log entry. Skips unless
 * DATABASE_URL is set.
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

// Distinct content per upload so each becomes its own candidate.
const resume = (name: string, skill: string) =>
  [name, "Backend Engineer", `- Shipped ${skill} services at scale.`].join("\n");

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
      name: "Bias Tester",
      email: `bias-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Bias Org", slug: `bias-${STAMP}` },
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

describe.skipIf(!available)("bias audit", () => {
  let jobId = "";

  it("sets up job, rubric, 4 candidates, scores, demographics, decisions", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Bias Job", description: "Bias audit job." }),
    });
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    const rubricRes = await app.request(`/api/jobs/${jobId}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    expect(rubricRes.status).toBe(201);

    // 4 candidates.
    const ids: string[] = [];
    const candidates: Array<[string, string]> = [
      ["ALEX CHEN", "kubernetes"],
      ["BLAKE RIVER", "postgres"],
      ["CASEY KIM", "redis"],
      ["DEV PATIL", "kafka"],
    ];
    for (const [i, [name, skill]] of candidates.entries()) {
      const form = new FormData();
      form.append("file", new File([resume(name, skill)], `r${i}.txt`, { type: "text/plain" }));
      const up = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(up.status).toBe(201);
      ids.push(((await up.json()) as { candidateId: string }).candidateId);
    }

    const score = await app.request(`/api/jobs/${jobId}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(score.status).toBe(200);

    // Demographics: 2 women, 1 man, 1 undisclosed (group values as reported).
    const [alex, blake, casey] = ids;
    if (!alex || !blake || !casey) throw new Error("fixture: candidates missing");
    const demo: Array<[string, string]> = [
      [alex, "woman"],
      [blake, "woman"],
      [casey, "man"],
    ];
    for (const [cid, value] of demo) {
      const res = await app.request(`/api/jobs/${jobId}/demographics/${cid}/demographics`, {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ dimension: "gender", value }),
      });
      expect(res.status).toBe(200);
    }

    // Decisions: shortlist both women + the man; leave one undisclosed.
    for (const cid of [alex, blake, casey]) {
      const res = await app.request(`/api/jobs/${jobId}/decisions`, {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: cid,
          stage: "shortlisted",
          reason: "Meets bar per rubric.",
        }),
      });
      expect(res.status).toBe(201);
    }

    expect(ids).toHaveLength(4);
  });

  it("generates the report with correct four-fifths results", async () => {
    const res = await app.request(`/api/jobs/${jobId}/bias-audit`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ dimension: "gender" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      audit: {
        referenceGroup: string;
        rows: Array<{
          group: string;
          considered: number;
          selected: number;
          adverseImpact: boolean | null;
        }>;
        allPass: boolean;
      };
      withDemographics: number;
      disclaimer: string;
    };

    expect(body.withDemographics).toBe(3);
    const byGroup = new Map(body.audit.rows.map((r) => [r.group, r]));
    // women: 2/2 selected = 1.0 ← reference; man: 1/1 = 1.0 → ratio 1 → pass;
    // undisclosed: 0/1 = 0 → ratio 0 → flagged.
    expect(byGroup.get("woman")?.selected).toBe(2);
    expect(byGroup.get("woman")?.adverseImpact).toBeNull(); // reference group
    expect(body.audit.referenceGroup).toBe("woman");
    expect(byGroup.get("man")?.adverseImpact).toBe(false);
    expect(byGroup.get("undisclosed")?.adverseImpact).toBe(true);
    expect(body.audit.allPass).toBe(false);
    expect(body.disclaimer).toContain("not a legal conclusion");
  });

  it("rejects an invalid dimension and unknown candidates", async () => {
    const bad = await app.request(`/api/jobs/${jobId}/bias-audit`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ dimension: "" }),
    });
    expect(bad.status).toBe(400);

    const noCandidate = await app.request(
      `/api/jobs/${jobId}/demographics/00000000-0000-0000-0000-000000000000/demographics`,
      {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ dimension: "gender", value: "woman" }),
      },
    );
    expect(noCandidate.status).toBe(404);
  });

  it("writes the audit-log entry", async () => {
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId))
      .orderBy(desc(auditLog.seq))
      .limit(1);
    expect(entry?.action).toBe("bias_audit.generated");
    const payload = (entry?.payload ?? {}) as Record<string, unknown>;
    expect(payload["dimension"]).toBe("gender");
  });
});
