/**
 * Talent-pool integration tests (v1.4): org-wide search across every
 * job's candidates — identity search, skill filter, stage facet, rubric-
 * weighted overall score, blind-review privacy, and org isolation.
 * Skips unless DATABASE_URL is set (never skips on CI).
 */

import { createMockModel } from "@hirelens/core";
import { auditLog, auth, createDb, organization } from "@hirelens/db";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";
let otherOrgId = "";

const STAMP = Date.now();

const LEVELS = [0, 1, 2, 3, 4, 5].map((n) => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
}));

function rubricJson() {
  return {
    version: 1,
    key: "talent-pool-eng",
    title: "Talent Pool Engineer",
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

/** Resume whose SKILLS section is fully controlled by the test. */
function resume(name: string, email: string, skills: string): string {
  return [name.toUpperCase(), email, "", "SKILLS", skills].join("\n");
}

const ALICE = {
  file: "alice-tp.txt",
  email: "alice.tp@example.com",
  skills: "Kafka, PostgreSQL, Docker",
};
const BOB = { file: "bob-tp.txt", email: "bob.tp@example.com", skills: "React, TypeScript" };

beforeAll(async () => {
  if (!available) return;
  const { model } = createMockModel({
    args: {
      criteria: ["c1", "c2", "c3", "c4", "c5"].map((key) => ({
        key,
        score: 3,
        confidence: 0.9,
        rationale: `mock ${key}`,
        // Verbatim in every candidate's resume (the shared SKILLS header),
        // so the never-a-naked-number evidence check passes.
        quote: "SKILLS",
      })),
    },
  });
  app = createApp({ db: createDb(DATABASE_URL), llm: model as never });

  // Primary org.
  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Pool Tester",
      email: `pool-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Pool Org", slug: `pool-${STAMP}` },
    headers: new Headers({ cookie }),
  });
  orgId = org.id;
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: new Headers({ cookie }),
  });

  // Job + rubric + two scored candidates.
  const jobRes = await app.request("/api/jobs", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: "Pool Job A", description: "Kafka streaming role." }),
  });
  expect(jobRes.status).toBe(201);
  const jobIdA = ((await jobRes.json()) as { job: { id: string } }).job.id;

  const rubricRes = await app.request(`/api/jobs/${jobIdA}/rubrics`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ rubric: rubricJson() }),
  });
  expect(rubricRes.status).toBe(201);

  for (const p of [ALICE, BOB]) {
    const form = new FormData();
    form.append(
      "file",
      new File(
        [resume(p.file.replace(".txt", "").replaceAll("-", " "), p.email, p.skills)],
        p.file,
        { type: "text/plain" },
      ),
    );
    const up = await app.request(`/api/jobs/${jobIdA}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(up.status).toBe(201);
  }

  const score = await app.request(`/api/jobs/${jobIdA}/score`, {
    method: "POST",
    headers: authHeaders,
  });
  expect(score.status).toBe(200);

  // Second job in the same org so the pool spans multiple jobs.
  const jobRes2 = await app.request("/api/jobs", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title: "Pool Job B", description: "Frontend role." }),
  });
  expect(jobRes2.status).toBe(201);
  const jobIdB = ((await jobRes2.json()) as { job: { id: string } }).job.id;
  const form2 = new FormData();
  form2.append(
    "file",
    new File([resume("carla tp", "carla.tp@example.com", "GraphQL, PostgreSQL")], "carla-tp.txt", {
      type: "text/plain",
    }),
  );
  const up2 = await app.request(`/api/jobs/${jobIdB}/candidates`, {
    method: "POST",
    headers: authHeaders,
    body: form2,
  });
  expect(up2.status).toBe(201);

  // A decision on Alice so the stage facet + stage filter have data.
  const listRes = await app.request(`/api/jobs/${jobIdA}/candidates`, { headers: authHeaders });
  const listBody = (await listRes.json()) as {
    candidates: Array<{ id: string; contactEmail: string | null }>;
  };
  const alice = listBody.candidates.find((r) => r.contactEmail === ALICE.email);
  expect(alice).toBeDefined();
  const decision = await app.request(`/api/jobs/${jobIdA}/decisions`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      candidateId: alice?.id,
      stage: "rejected",
      reason: "Not a fit for this role",
    }),
  });
  expect(decision.status).toBe(201);

  // A second org whose candidate must never leak into the pool.
  const signUp2 = await auth.api.signUpEmail({
    body: {
      name: "Other Tester",
      email: `pool-other-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie2 = signUp2.headers.get("set-cookie")?.split(";")[0] ?? "";
  const org2 = await auth.api.createOrganization({
    body: { name: "Pool Other Org", slug: `pool-other-${STAMP}` },
    headers: new Headers({ cookie: cookie2 }),
  });
  otherOrgId = org2.id;
  await auth.api.setActiveOrganization({
    body: { organizationId: otherOrgId },
    headers: new Headers({ cookie: cookie2 }),
  });
  const jobRes3 = await app.request("/api/jobs", {
    method: "POST",
    headers: { cookie: cookie2, "content-type": "application/json" },
    body: JSON.stringify({ title: "Other Org Job", description: "Secret role." }),
  });
  expect(jobRes3.status).toBe(201);
  const jobIdC = ((await jobRes3.json()) as { job: { id: string } }).job.id;
  const form3 = new FormData();
  form3.append(
    "file",
    new File([resume("zoe other", "zoe.other@example.com", "Kafka, Rust")], "zoe-tp.txt", {
      type: "text/plain",
    }),
  );
  const up3 = await app.request(`/api/jobs/${jobIdC}/candidates`, {
    method: "POST",
    headers: { cookie: cookie2 },
    body: form3,
  });
  expect(up3.status).toBe(201);

  // Back to the primary org for every test below.
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: new Headers({ cookie }),
  });
});

afterAll(async () => {
  if (!available) return;
  const db = createDb(DATABASE_URL);
  if (orgId !== "") await db.delete(organization).where(eq(organization.id, orgId));
  if (otherOrgId !== "") await db.delete(organization).where(eq(organization.id, otherOrgId));
});

describe.skipIf(!available && allowSkip)("talent pool", () => {
  it("lists candidates across every job in the org with job context", async () => {
    const res = await app.request("/api/talent-pool", { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      total: number;
      candidates: Array<{ jobTitle: string; skills: string[]; overall: number | null }>;
      facets: { stages: Record<string, number>; skills: Array<{ skill: string; count: number }> };
    };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(3);
    const titles = body.candidates.map((r) => r.jobTitle).sort();
    expect(titles).toEqual(["Pool Job A", "Pool Job A", "Pool Job B"]);
    // Mock model scores 3/5 on five equal-weight criteria → 60/100.
    const scored = body.candidates.filter((r) => r.jobTitle === "Pool Job A");
    for (const r of scored) expect(r.overall).toBe(60);
    // Skill facet counts candidates per skill across the pool.
    const kafka = body.facets.skills.find((f) => f.skill.toLowerCase() === "kafka");
    expect(kafka?.count).toBe(1);
  });

  it("searches identities across jobs (email and filename)", async () => {
    const byEmail = await app.request(`/api/talent-pool?q=${encodeURIComponent("carla.tp@")}`, {
      headers: authHeaders,
    });
    const emailBody = (await byEmail.json()) as {
      total: number;
      candidates: Array<{ jobTitle: string }>;
    };
    expect(emailBody.total).toBe(1);
    expect(emailBody.candidates[0]?.jobTitle).toBe("Pool Job B");

    const byFile = await app.request("/api/talent-pool?q=alice-tp", { headers: authHeaders });
    const fileBody = (await byFile.json()) as { total: number };
    expect(fileBody.total).toBe(1);
  });

  it("filters by skill from the parsed resume", async () => {
    const res = await app.request("/api/talent-pool?skills=graphql", { headers: authHeaders });
    const body = (await res.json()) as {
      total: number;
      candidates: Array<{ contactEmail: string | null }>;
    };
    expect(body.total).toBe(1);
    expect(body.candidates[0]?.contactEmail).toBe("carla.tp@example.com");
  });

  it("filters by stage and reports stage facets", async () => {
    const res = await app.request("/api/talent-pool?stage=rejected", { headers: authHeaders });
    const body = (await res.json()) as {
      total: number;
      facets: { stages: Record<string, number> };
    };
    expect(body.total).toBe(1);
    expect(body.facets.stages["rejected"]).toBe(1);
  });

  it("filters by minimum overall score", async () => {
    const pass = await app.request("/api/talent-pool?minScore=60", { headers: authHeaders });
    const passBody = (await pass.json()) as { total: number };
    expect(passBody.total).toBe(2);

    const fail = await app.request("/api/talent-pool?minScore=90", { headers: authHeaders });
    const failBody = (await fail.json()) as { total: number };
    expect(failBody.total).toBe(0);
  });

  it("shortlists a rediscovered candidate with an audited decision", async () => {
    const listRes = await app.request("/api/talent-pool", { headers: authHeaders });
    const listBody = (await listRes.json()) as {
      candidates: Array<{ id: string; contactEmail: string | null }>;
    };
    const carla = listBody.candidates.find((r) => r.contactEmail === "carla.tp@example.com");
    expect(carla).toBeDefined();

    const res = await app.request("/api/talent-pool/shortlist", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ candidateId: carla?.id, reason: "Great for the platform team" }),
    });
    expect(res.status).toBe(201);

    // The decision exists on Carla's own job review queue.
    const decisionsRes = await app.request("/api/talent-pool?stage=shortlisted", {
      headers: authHeaders,
    });
    const decisionsBody = (await decisionsRes.json()) as { total: number };
    expect(decisionsBody.total).toBe(1);
  });

  it("masks identity in blind mode and ignores q", async () => {
    const res = await app.request("/api/talent-pool?blind=1&q=alice", { headers: authHeaders });
    const body = (await res.json()) as {
      total: number;
      candidates: Array<{
        label: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
      }>;
    };
    expect(body.total).toBe(3);
    for (const row of body.candidates) {
      expect(row.label).toBeNull();
      expect(row.contactEmail).toBeNull();
      expect(row.contactPhone).toBeNull();
    }
  });

  it("never returns another organization's candidates", async () => {
    const res = await app.request("/api/talent-pool?q=zoe", { headers: authHeaders });
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  describe("add to job", () => {
    it("re-ingests the stored file into the target job as a new candidate", async () => {
      const listRes = await app.request("/api/talent-pool", { headers: authHeaders });
      const listBody = (await listRes.json()) as {
        candidates: Array<{
          id: string;
          contactEmail: string | null;
          jobId: string;
          jobTitle: string;
        }>;
      };
      const carla = listBody.candidates.find((r) => r.contactEmail === "carla.tp@example.com");
      expect(carla).toBeDefined();

      // Target job: fresh one so the count assertions are self-contained.
      const jobRes = await app.request("/api/jobs", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ title: `AddTarget ${STAMP}`, description: "Platform role." }),
      });
      expect(jobRes.status).toBe(201);
      const targetJobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

      const res = await app.request("/api/talent-pool/add-to-job", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ candidateId: carla?.id, jobId: targetJobId }),
      });
      expect(res.status).toBe(201);
      const addBody = (await res.json()) as {
        ok: boolean;
        status: string;
        candidateId: string;
        jobId: string;
      };
      expect(addBody.ok).toBe(true);
      expect(addBody.status).toBe("created");
      expect(addBody.jobId).toBe(targetJobId);
      expect(addBody.candidateId).not.toBe(carla?.id);

      // The copy lives on the target job with the parsed profile intact.
      const targetRes = await app.request(`/api/jobs/${targetJobId}/candidates`, {
        headers: authHeaders,
      });
      const targetBody = (await targetRes.json()) as {
        candidates: Array<{ id: string; contactEmail: string | null }>;
      };
      expect(targetBody.candidates.map((r) => r.contactEmail)).toContain("carla.tp@example.com");
      expect(targetBody.candidates).toHaveLength(1);
    });

    it("treats a second add as duplicate (per-job text-hash dedupe)", async () => {
      const listRes = await app.request("/api/talent-pool", { headers: authHeaders });
      const listBody = (await listRes.json()) as {
        candidates: Array<{
          id: string;
          contactEmail: string | null;
          jobTitle: string;
          jobId: string;
        }>;
      };
      const carla = listBody.candidates.find(
        (r) => r.contactEmail === "carla.tp@example.com" && r.jobTitle === `AddTarget ${STAMP}`,
      );
      expect(carla).toBeDefined();

      // The job Carla now belongs to (AddTarget) is where she lives; add
      // her from there again → the job's own hash-dedupe no-ops.
      const res = await app.request("/api/talent-pool/add-to-job", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ candidateId: carla?.id, jobId: carla?.jobId }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; status: string };
      expect(body.ok).toBe(true);
      expect(body.status).toBe("duplicate");
    });

    it("rejects adding to a closed job", async () => {
      // Close the target job, then attempt an add.
      const jobsRes = await app.request("/api/jobs?limit=100", { headers: authHeaders });
      const jobsBody = (await jobsRes.json()) as {
        jobs: Array<{ id: string; title: string; status: string }>;
      };
      const jobs = jobsBody.jobs;
      const target = jobs.find((j) => j.title === `AddTarget ${STAMP}`);
      expect(target).toBeDefined();
      const closeRes = await app.request(`/api/jobs/${target?.id}`, {
        method: "PATCH",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      expect(closeRes.status).toBe(200);

      const listRes = await app.request("/api/talent-pool", { headers: authHeaders });
      const listBody = (await listRes.json()) as {
        candidates: Array<{ id: string; contactEmail: string | null; jobTitle: string }>;
      };
      const alice = listBody.candidates.find((r) => r.contactEmail === ALICE.email);
      expect(alice).toBeDefined();

      const res = await app.request("/api/talent-pool/add-to-job", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ candidateId: alice?.id, jobId: target?.id }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.error).toBe("job_closed");
    });

    it("never leaks candidates across organizations", async () => {
      // A candidate from the other org + a job in our org.
      const otherSignIn = await app.request("/api/talent-pool?blind=1", {
        headers: { cookie: "x=none" },
      });
      expect(otherSignIn.status).toBeGreaterThanOrEqual(400);

      // Get the other org's candidate id via its own session instead —
      // rebuild the other org's cookie the same way beforeAll did.
      const signUp2 = await auth.api.signUpEmail({
        body: {
          name: "Other Tester 2",
          email: `pool-other2-${STAMP}@example.com`,
          password: "Str0ng-Passw0rd!123",
        },
        returnHeaders: true,
      });
      const cookie2 = signUp2.headers.get("set-cookie")?.split(";")[0] ?? "";
      const org2 = await auth.api.createOrganization({
        body: { name: `Pool Other Org 2 ${STAMP}`, slug: `pool-other2-${STAMP}` },
        headers: new Headers({ cookie: cookie2 }),
      });
      await auth.api.setActiveOrganization({
        body: { organizationId: org2.id },
        headers: new Headers({ cookie: cookie2 }),
      });
      const oJobRes = await app.request("/api/jobs", {
        method: "POST",
        headers: { cookie: cookie2, "content-type": "application/json" },
        body: JSON.stringify({ title: `Other2 Job ${STAMP}`, description: "Secret role." }),
      });
      const oJobId = ((await oJobRes.json()) as { job: { id: string } }).job.id;
      const oForm = new FormData();
      oForm.append(
        "file",
        new File([resume("yara other2", "yara.other2@example.com", "Kafka")], "yara-tp.txt", {
          type: "text/plain",
        }),
      );
      await app.request(`/api/jobs/${oJobId}/candidates`, {
        method: "POST",
        headers: { cookie: cookie2 },
        body: oForm,
      });
      const oList = await app.request(`/api/jobs/${oJobId}/candidates`, {
        headers: { cookie: cookie2 },
      });
      const oListBody = (await oList.json()) as {
        candidates: Array<{ id: string; contactEmail: string | null }>;
      };
      const yara = oListBody.candidates.find((r) => r.contactEmail === "yara.other2@example.com");
      expect(yara).toBeDefined();

      // Our org's session tries to add the other org's candidate to OUR job.
      const jobsRes = await app.request("/api/jobs?limit=100", { headers: authHeaders });
      const jobsBody = (await jobsRes.json()) as { jobs: Array<{ id: string; status: string }> };
      const jobs = jobsBody.jobs;
      const ourOpenJob = jobs.find((j) => j.status === "open" || j.status === "draft");
      expect(ourOpenJob).toBeDefined();
      const res = await app.request("/api/talent-pool/add-to-job", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ candidateId: yara?.id, jobId: ourOpenJob?.id }),
      });
      expect(res.status).toBe(404); // not visible, never a leak
      await dbCleanupOrg(org2.id);
    });

    it("writes an audited candidate.added_to_job trail entry", async () => {
      // Verify the hash-chained trail recorded the earlier add (the
      // happy-path test) with a link back to the target job.
      const jobsRes = await app.request("/api/jobs?limit=100", { headers: authHeaders });
      const jobsBody = (await jobsRes.json()) as { jobs: Array<{ id: string; title: string }> };
      const jobs = jobsBody.jobs;
      const target = jobs.find((j) => j.title === `AddTarget ${STAMP}`);
      expect(target).toBeDefined();

      const db = createDb(DATABASE_URL);
      const rows = await db
        .select({ action: auditLog.action, payload: auditLog.payload })
        .from(auditLog)
        .where(eq(auditLog.orgId, orgId))
        .orderBy(desc(auditLog.seq));
      const added = rows.find((r) => r.action === "candidate.added_to_job");
      expect(added).toBeDefined();
      const addedPayload = (added?.payload ?? {}) as Record<string, unknown>;
      expect(addedPayload["jobId"]).toBe(target?.id);
      expect(addedPayload["sourceCandidateId"]).toBeDefined();
    });
  });
});

async function dbCleanupOrg(orgId: string) {
  const db = createDb(DATABASE_URL);
  await db.delete(organization).where(eq(organization.id, orgId));
}
