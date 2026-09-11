/**
 * API integration test: auth-gated, org-scoped jobs + rubrics routes
 * against a real Postgres (same availability contract as the
 * orchestrator suite). Skips unless DATABASE_URL is set.
 *
 * Sessions are created through the real better-auth flow (sign-up →
 * create organization → set active) so the cookie round-trip is
 * exercised exactly as in production.
 */

import { parseRubric } from "@hirelens/core";
import { auth, createDb, type Database, jobs, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;

let db: Database;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";
let otherOrgId = "";

const STAMP = Date.now();

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });

  // Sign up through better-auth (creates user + account + session).
  const signUp = await auth.api.signUpEmail({
    body: {
      name: "API Tester",
      email: `api-test-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toContain("session_token");
  authHeaders = { cookie };

  // Create the organization and make it the session's active org.
  const org = await auth.api.createOrganization({
    body: { name: "API Test Org", slug: `api-test-${STAMP}` },
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
  if (otherOrgId !== "") {
    await db.delete(organization).where(eq(organization.id, otherOrgId));
  }
});

describe.skipIf(!available)("API routes", () => {
  it("serves health without auth", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("hirelens-api");
  });

  it("rejects unauthenticated /api/jobs", async () => {
    const res = await app.request("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("creates and lists a job within the org", async () => {
    const create = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Backend Engineer",
        description: "Build services with TypeScript and Postgres.",
      }),
    });
    expect(create.status).toBe(201);
    const { job } = (await create.json()) as { job: { id: string; title: string } };
    expect(job.title).toBe("Backend Engineer");

    const list = await app.request("/api/jobs", { headers: authHeaders });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { jobs: { id: string }[] };
    expect(body.jobs.some((j) => j.id === job.id)).toBe(true);
  });

  it("validates job creation body", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("imports a rubric as the next version and returns versions newest-first", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Rubric Job", description: "JD for rubric tests." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const levels = [0, 1, 2, 3, 4, 5].map((n) => ({
      label: String(n),
      description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
    }));
    const criterion = (key: string, weight: number) => ({
      key,
      title: key,
      weight,
      scale: levels,
      doNotUse: [],
    });
    const rubricJson = {
      version: 1,
      key: "backend-eng",
      title: "Backend Engineer",
      criteria: [
        criterion("system-design", 2),
        criterion("databases", 1),
        criterion("testing", 1),
        criterion("ops", 1),
        criterion("communication", 1),
      ],
      exclusions: [],
    };
    // Sanity: the fixture must be a valid rubric before we post it.
    expect(() => parseRubric(JSON.stringify(rubricJson))).not.toThrow();

    const v1 = await app.request(`/api/jobs/${job.id}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: rubricJson }),
    });
    expect(v1.status).toBe(201);
    const v1Body = (await v1.json()) as { rubric: { version: number } };
    expect(v1Body.rubric.version).toBe(1);

    const list = await app.request(`/api/jobs/${job.id}/rubrics`, { headers: authHeaders });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { rubrics: { version: number }[] };
    expect(listBody.rubrics[0]?.version).toBe(1);
  });

  it("rejects an invalid rubric import with invalid_rubric", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Bad Rubric Job", description: "JD." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const res = await app.request(`/api/jobs/${job.id}/rubrics`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ rubric: { nope: true } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_rubric");
  });

  it("503s derive when no LLM is configured", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Derive Job", description: "JD." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const res = await app.request(`/api/jobs/${job.id}/rubrics/derive`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("llm_not_configured");
  });

  it("hides other orgs' jobs", async () => {
    const [foreignOrg] = await db
      .insert(organization)
      .values({
        id: `org-api-test-other-${STAMP}`,
        name: "Other Org",
        slug: `api-test-other-${STAMP}`,
        createdAt: new Date(),
      })
      .returning({ id: organization.id });
    otherOrgId = foreignOrg?.id ?? "";
    await db.insert(jobs).values({
      orgId: otherOrgId,
      title: "Secret Job",
      description: "Not yours.",
      status: "open",
    });

    const list = await app.request("/api/jobs", { headers: authHeaders });
    const body = (await list.json()) as { jobs: { title: string }[] };
    expect(body.jobs.some((j) => j.title === "Secret Job")).toBe(false);
  });

  describe("candidates + scoring", () => {
    let jobId = "";

    const RESUME_A = [
      "JORDAN AVERY",
      "Senior Backend Engineer - jordan.avery@example.com - github.com/javery",
      "",
      "EXPERIENCE",
      "Senior Backend Engineer - Acme Corp - 2021 - Present",
      "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
      "- Built event-driven TypeScript services on Node.js handling 40k req/s.",
      "",
      "SKILLS",
      "TypeScript, Node.js, PostgreSQL, Kubernetes, AWS",
    ].join("\n");

    const RESUME_B = [
      "SAM RIVERA",
      "Backend Engineer - sam.rivera@example.com",
      "",
      "EXPERIENCE",
      "Backend Engineer - Globex - 2019 - 2024",
      "- Designed PostgreSQL schemas and APIs for the logistics platform.",
      "",
      "SKILLS",
      "Python, Django, PostgreSQL, Docker",
    ].join("\n");

    beforeAll(async () => {
      const res = await app.request("/api/jobs", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          title: "Ingest Job",
          description: "Senior backend engineer with strong systems skills.",
        }),
      });
      const body = (await res.json()) as { job: { id: string } };
      jobId = body.job.id;
    });

    function txtResume(name: string, text: string): File {
      return new File([text], name, { type: "text/plain" });
    }

    it("ingests a txt resume and reports the parsed candidate", async () => {
      const form = new FormData();
      form.append("file", txtResume("jordan.txt", RESUME_A));
      const res = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        status: string;
        candidateId: string;
        documentId: string;
      };
      expect(body.status).toBe("created");
      expect(body.candidateId).toBeTruthy();
      expect(body.documentId).toBeTruthy();
    });

    it("flags a re-upload of the same content as duplicate", async () => {
      const form = new FormData();
      form.append("file", txtResume("jordan-again.txt", RESUME_A));
      const res = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; candidateId: string };
      expect(body.status).toBe("duplicate");
    });

    it("rejects files with no extractable text", async () => {
      const form = new FormData();
      form.append("file", txtResume("empty.txt", ""));
      const res = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("unreadable_document");
    });

    it("ingests a ZIP batch and dedupes within it", async () => {
      const zip = zipSync({
        "batch/sam.txt": new TextEncoder().encode(RESUME_B),
        "batch/jordan-dupe.txt": new TextEncoder().encode(RESUME_A),
        "batch/empty.txt": new TextEncoder().encode(""),
      });
      const form = new FormData();
      form.append(
        "file",
        new File([new Uint8Array(zip)], "batch.zip", { type: "application/zip" }),
      );
      const res = await app.request(`/api/jobs/${jobId}/candidates/zip`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        created: number;
        duplicates: number;
        skipped: { name: string; reason: string }[];
      };
      expect(body.created).toBe(1);
      expect(body.duplicates).toBe(1);
      expect(body.skipped.some((s) => s.name.includes("empty.txt"))).toBe(true);
    });

    it("503s scoring without an LLM and lists runs", async () => {
      const score = await app.request(`/api/jobs/${jobId}/score`, {
        method: "POST",
        headers: authHeaders,
      });
      expect(score.status).toBe(503);

      const runs = await app.request(`/api/jobs/${jobId}/runs`, { headers: authHeaders });
      expect(runs.status).toBe(200);
      const body = (await runs.json()) as { runs: unknown[] };
      expect(body.runs).toEqual([]);
    });
  });
});
