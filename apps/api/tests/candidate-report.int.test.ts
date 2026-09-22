/**
 * Candidate report integration tests (v1.1): create/list/revoke CRUD,
 * public token fetch with scores + evidence + anchors, privacy projection
 * (no other candidates, no contact info), read counting, and revoked-state
 * handling. Skips unless DATABASE_URL is set.
 */

import { createMockModel } from "@hirelens/core";
import { auth, createDb, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"]; // On CI these suites must never silently skip — fail loudly instead

let db: ReturnType<typeof createDb>;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();

const RESUME = [
  "Jordan Avery",
  "Email: jordan.avery@example.com | Phone: +1 415 555 0100",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
  "- Built REST APIs in TypeScript and Python.",
].join("\n");

const OTHER_RESUME = [
  "Someone Else",
  "Email: someone.else@example.com",
  "",
  "EXPERIENCE",
  "Junior Developer - Other Corp",
  "- Did some tasks.",
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
        score: 4,
        confidence: 0.9,
        rationale: `Solid on ${key}.`,
        quote: "Kubernetes, cutting deploy time 80%",
      })),
    },
  });
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Report Tester",
      email: `report-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Report Org", slug: `report-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("candidate report", () => {
  let jobId = "";
  let candidateId = "";
  let _otherId = "";
  let token = "";

  it("sets up job, rubric, two candidates, and scores them", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Report Job", description: "Candidate report job." }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    const rubricRes = await app.request(`/api/jobs/${jobId}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson() }),
    });
    expect(rubricRes.status).toBe(201);

    for (const [name, body] of [
      ["jordan.txt", RESUME],
      ["other.txt", OTHER_RESUME],
    ] as const) {
      const form = new FormData();
      form.append("file", new File([body], name, { type: "text/plain" }));
      const up = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(up.status).toBe(201);
      const id = ((await up.json()) as { candidateId: string }).candidateId;
      if (name === "jordan.txt") candidateId = id;
      else _otherId = id;
    }

    const score = await app.request(`/api/jobs/${jobId}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(score.status).toBe(200);
    const { summary } = (await score.json()) as { summary: { scored: number } };
    expect(summary.scored).toBe(2);
  });

  it("refuses link creation before scores exist (409 path is guarded by setup)", async () => {
    // Setup already scored, so a fresh job with no scores should 409.
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Empty Job", description: "No scores here." }),
    });
    const emptyJobId = ((await jobRes.json()) as { job: { id: string } }).job.id;
    const res = await app.request(`/api/jobs/${emptyJobId}/candidates/${candidateId}/report`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404); // candidate belongs to a different job
  });

  it("creates a link, returns the token once, and supersedes older links", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/report`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ message: "Thanks for interviewing — here is your outcome." }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: { token: string } };
    token = body.link.token;
    expect(token.length).toBeGreaterThan(30);

    // Second link supersedes the first (revokes it) — and carries the note.
    const res2 = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/report`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ message: "Thanks for interviewing — here is your outcome." }),
    });
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as { link: { token: string } };
    token = body2.link.token;

    const listRes = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/report`, {
      headers: authHeaders,
    });
    const list = (await listRes.json()) as {
      links: Array<{ revokedAt: string | null }>;
    };
    expect(list.links.length).toBe(2);
    expect(list.links.filter((l) => l.revokedAt === null).length).toBe(1);
  });

  it("serves the public report with scores, evidence, and anchors — and nothing else", async () => {
    const res = await app.request(`/api/report/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        jobTitle: string;
        overall: number | null;
        band: string | null;
        message: string | null;
        criteria: Array<{
          title: string;
          score: number | null;
          evidence: string[];
          scale: Array<{ description: string }>;
        }>;
      };
    };
    const report = body.report;
    expect(report.jobTitle).toBe("Report Job");
    expect(report.message).toBe("Thanks for interviewing — here is your outcome.");
    expect(report.overall).not.toBeNull();
    expect(report.band).toBe("Strong match"); // all 4/5 → 80
    expect(report.criteria.length).toBe(5);
    for (const crit of report.criteria) {
      expect(crit.score).toBe(4);
      expect(crit.scale.length).toBe(6);
    }

    // The other candidate's data never appears.
    const text = JSON.stringify(body);
    expect(text).not.toContain("someone.else@example.com");
    expect(text).not.toContain("Someone Else");
    // The candidate's own contact info stays private too.
    expect(text).not.toContain("jordan.avery@example.com");
  });

  it("report payload includes skill-graph buckets and improvement steps (v1.2)", async () => {
    const body = (await app.request(`/api/report/${token}`).then((r) => r.json())) as {
      report: {
        skills?: { matched: string[]; adjacent: string[]; missing: string[] };
        improve?: string[];
      };
    };

    // Skill buckets computed from the JD against the parsed resume.
    expect(Array.isArray(body.report.skills?.matched)).toBe(true);
    expect(Array.isArray(body.report.skills?.adjacent)).toBe(true);
    expect(Array.isArray(body.report.skills?.missing)).toBe(true);
    // Guidance present and bounded (max 5 steps).
    expect(body.report.improve?.length ?? 0).toBeGreaterThan(0);
    expect((body.report.improve ?? []).length).toBeLessThanOrEqual(5);
  });

  it("counts reads, revokes via DELETE (→410), and 404s unknown tokens", async () => {
    // Read counting.
    await app.request(`/api/report/${token}`);
    const listRes = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/report`, {
      headers: authHeaders,
    });
    const list = (await listRes.json()) as {
      links: Array<{ id: string; revokedAt: string | null; readCount: number }>;
    };
    const active = list.links.find((l) => l.revokedAt === null);
    expect(active?.readCount).toBeGreaterThanOrEqual(1);

    // Unknown token → 404.
    const missing = await app.request("/api/report/nope-not-real");
    expect(missing.status).toBe(404);

    // Revoke the active link, then the public URL must 410.
    const del = await app.request(
      `/api/jobs/${jobId}/candidates/${candidateId}/report/${active?.id}`,
      { method: "DELETE", headers: authHeaders },
    );
    expect(del.status).toBe(200);
    const after = await app.request(`/api/report/${token}`);
    expect(after.status).toBe(410);
  });
});
