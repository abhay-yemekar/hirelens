/**
 * Wave 4 integration tests: interview-kit export (JSON + HTML) and the
 * candidate portal (create → public invite → opt-in self-report → one-shot
 * consumed → revoke → 410). Skips unless DATABASE_URL is set.
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
        quote: "Senior Backend Engineer - Acme Corp - 2021 - Present",
      })),
    },
  });
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Wave4 Tester",
      email: `wave4-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Wave4 Org", slug: `wave4-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("interview kits + candidate portal", () => {
  let jobId = "";
  let runId = "";
  let candidateId = "";
  let portalToken = "";
  let portalLinkId = "";

  it("sets up a job with a scored candidate", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Wave4 Job", description: "Kit + portal test job." }),
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
    const runsRes = await app.request(`/api/jobs/${jobId}/runs`, { headers: authHeaders });
    const runsBody = (await runsRes.json()) as { runs: Array<{ id: string; status: string }> };
    runId = runsBody.runs[0]?.id ?? "";
    expect(runId).not.toBe("");
  });

  it("exports an interview kit as JSON with probes and evidence", async () => {
    const res = await app.request(
      `/api/jobs/${jobId}/runs/${runId}/interview-kit.json?candidate=${candidateId}`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kit: {
        candidateLabel: string;
        overall: number;
        criteria: Array<{
          title: string;
          score: number | null;
          probes: string[];
          anchors: { awarded: string | null };
          evidence: string[];
        }>;
      };
    };
    expect(body.kit.candidateLabel).toBe("jordan");
    expect(body.kit.overall).toBeGreaterThan(0);
    expect(body.kit.criteria.length).toBe(5);
    for (const c of body.kit.criteria) {
      expect(c.score).toBe(3);
      expect(c.probes.length).toBeGreaterThan(0);
      expect(c.anchors.awarded).toBe("level 3");
    }
    // Evidence quotes carry through from the mock model.
    expect(body.kit.criteria.some((c) => c.evidence.length > 0)).toBe(true);
  });

  it("renders a printable HTML kit", async () => {
    const res = await app.request(
      `/api/jobs/${jobId}/runs/${runId}/interview-kit.html?candidate=${candidateId}`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Interview kit");
    expect(html).toContain("jordan");
    expect(html).toContain("level 3");
  });

  it("creates a portal link (token shown once)", async () => {
    const res = await app.request(`/api/jobs/${jobId}/portal/${candidateId}`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: { id: string; token: string } };
    expect(body.link.token.length).toBeGreaterThan(30);
    portalToken = body.link.token;
    portalLinkId = body.link.id;
  });

  it("serves the public invitation without auth", async () => {
    const res = await app.request(`/api/portal/${portalToken}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invitation: { jobTitle: string; dimensions: string[]; note: string };
    };
    expect(body.invitation.jobTitle).toBe("Wave4 Job");
    expect(body.invitation.dimensions).toContain("gender");
    expect(body.invitation.note).toContain("Opt-in only");
  });

  it("accepts an opt-in self-report and consumes the link (one-shot)", async () => {
    const res = await app.request(`/api/portal/${portalToken}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dimension: "gender", value: "woman" }),
    });
    expect(res.status).toBe(200);

    // The link is one-shot.
    const again = await app.request(`/api/portal/${portalToken}`);
    expect(again.status).toBe(409);

    // The self-report landed in demographics for the bias audit to consume.
    const bias = await app.request(`/api/jobs/${jobId}/bias-audit`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ dimension: "gender" }),
    });
    expect(bias.status).toBe(200);
    const biasBody = (await bias.json()) as { withDemographics: number };
    expect(biasBody.withDemographics).toBe(1);
  });

  it("rejects invalid submissions", async () => {
    // Fresh link (the first one was consumed by the submit test).
    const create = await app.request(`/api/jobs/${jobId}/portal/${candidateId}`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(create.status).toBe(201);
    const { link } = (await create.json()) as { link: { token: string } };

    const res = await app.request(`/api/portal/${link.token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dimension: "gender", value: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("revokes the link; revoked tokens return 410", async () => {
    // Fresh link (previous one was consumed by the invalid-body test).
    const create = await app.request(`/api/jobs/${jobId}/portal/${candidateId}`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(create.status).toBe(201);
    const { link } = (await create.json()) as { link: { id: string; token: string } };

    const del = await app.request(`/api/jobs/${jobId}/portal/${link.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    // (route: DELETE /api/jobs/:jobId/portal/:linkId)
    expect(del.status).toBe(200);

    const revoked = await app.request(`/api/portal/${link.token}`);
    expect(revoked.status).toBe(410);
    expect(portalToken.length).toBeGreaterThan(0);
    expect(portalLinkId.length).toBeGreaterThan(0);
  });
});
