/**
 * Wave 3 sharing integration tests: share-link create → public token read →
 * revoke → 410; audit CSV export with per-row hash verification.
 * Skips unless DATABASE_URL is set.
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
        quote: "",
      })),
    },
  });
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Share Tester",
      email: `share-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Share Org", slug: `share-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("share links + audit export", () => {
  let jobId = "";
  let token = "";
  let linkId = "";

  it("sets up a job with a completed run", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Share Job", description: "Sharing test job." }),
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

    const score = await app.request(`/api/jobs/${jobId}/score`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(score.status).toBe(200);
  });

  it("creates a share link and returns the token", async () => {
    const res = await app.request(`/api/jobs/${jobId}/share`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Panel review" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { link: { id: string; token: string } };
    expect(body.link.token.length).toBeGreaterThan(30);
    token = body.link.token;
    linkId = body.link.id;
  });

  it("serves the public report without auth and counts reads", async () => {
    const first = await app.request(`/api/share/${token}`);
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      report: {
        jobTitle: string;
        candidates: Array<{ label: string | null; overall: number; criteria: unknown[] }>;
      };
    };
    expect(body.report.jobTitle).toBe("Share Job");
    expect(body.report.candidates.length).toBe(1);
    expect(body.report.candidates[0]?.label).toBe("jordan");
    expect(body.report.candidates[0]?.overall).toBeGreaterThan(0);
    expect(body.report.candidates[0]?.criteria.length).toBe(5);

    const second = await app.request(`/api/share/${token}`);
    expect(second.status).toBe(200);

    const list = await app.request(`/api/jobs/${jobId}/share`, { headers: authHeaders });
    const listed = (await list.json()) as { links: Array<{ readCount: number | null }> };
    expect(listed.links[0]?.readCount ?? 0).toBe(2);
  });

  it("rejects unknown and revoked tokens", async () => {
    const missing = await app.request("/api/share/not-a-real-token");
    expect(missing.status).toBe(404);

    const del = await app.request(`/api/jobs/${jobId}/share/${linkId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(del.status).toBe(200);

    const revoked = await app.request(`/api/share/${token}`);
    expect(revoked.status).toBe(410);
  });

  it("exports the hash-chained audit log as CSV", async () => {
    const res = await app.request(`/api/jobs/${jobId}/audit-export.csv`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    const lines = csv.split("\n").filter((l) => l.length > 0);
    expect(lines[0]).toContain("seq,at,action,actor,chain_valid");
    // Every row must self-verify: our export recomputes each linkage hash.
    for (const line of lines.slice(1)) {
      expect(line).toContain(",yes,");
    }
  });
});
