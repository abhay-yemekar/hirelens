/**
 * Skill-graph adjacency integration tests (v1.2): target extraction from
 * the JD, matched/adjacent/missing computation from the parsed resume,
 * and the explicit `skills` query override. Skips unless DATABASE_URL is
 * set (and never skips on CI).
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

/** Resume with an unambiguous SKILLS section so parsing is deterministic. */
const RESUME = [
  "PRIYA SHARMA",
  "priya.sharma@example.com",
  "",
  "SUMMARY",
  "Data platform engineer.",
  "",
  "SKILLS",
  "Python, Kubernetes, Kafka, Airflow, dbt",
].join("\n");

/** JD rich in taxonomy skills — including a family neighbor of Kafka. */
const JD = [
  "Senior Data Engineer",
  "",
  "We are looking for a data engineer with strong Python and SQL skills.",
  "Experience with Kafka and Airflow required; Snowflake a plus.",
  "You will run production workloads on Kubernetes and AWS.",
].join("\n");

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
      name: "Skills Tester",
      email: `skills-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Skills Org", slug: `skills-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("skill graph endpoint", () => {
  let jobId = "";
  let candidateId = "";

  it("sets up job and candidate", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Data Engineer", description: JD }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    const form = new FormData();
    form.append("file", new File([RESUME], "priya.txt", { type: "text/plain" }));
    const up = await app.request(`/api/jobs/${jobId}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(up.status).toBe(201);
    candidateId = ((await up.json()) as { candidateId: string }).candidateId;
    expect(candidateId).not.toBe("");
  });

  it("extracts target skills from the JD and computes matched/adjacent/missing", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates/${candidateId}/skills`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      target: string[];
      matched: string[];
      adjacent: string[];
      missing: string[];
    };

    // Targets pulled from the JD text itself.
    expect(body.target).toContain("Python");
    expect(body.target).toContain("SQL");
    expect(body.target).toContain("Kafka");
    expect(body.target).toContain("Kubernetes");
    expect(body.target).toContain("AWS");

    // Demonstrated skills match directly.
    expect(body.matched).toContain("Python");
    expect(body.matched).toContain("Kafka");
    expect(body.matched).toContain("Kubernetes");

    // Adjacent = candidate skills from a family the JD targets but not
    // required: dbt sits in the data family (Kafka/Snowflake/Airflow).
    expect(body.adjacent).toContain("dbt");
    // Not demonstrated anywhere in the resume.
    expect(body.missing).toContain("SQL");
    expect(body.missing).toContain("Snowflake");
    expect(body.missing).toContain("AWS");
  });

  it("honors the explicit skills query override", async () => {
    const res = await app.request(
      `/api/jobs/${jobId}/candidates/${candidateId}/skills?skills=${encodeURIComponent(
        "Python,NLP",
      )}`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { target: string[]; matched: string[]; missing: string[] };
    expect(body.target).toEqual(["Python", "NLP"]);
    expect(body.matched).toEqual(["Python"]);
    expect(body.missing).toEqual(["NLP"]);
  });

  it("404s for a candidate in another job", async () => {
    const other = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Other", description: "Other role." }),
    });
    expect(other.status).toBe(201);
    const otherId = ((await other.json()) as { job: { id: string } }).job.id;

    const res = await app.request(`/api/jobs/${otherId}/candidates/${candidateId}/skills`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
  });
});
