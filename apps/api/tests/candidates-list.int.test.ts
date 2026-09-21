/**
 * Candidates list integration tests: server-side pagination, identity
 * search (filename/email/phone), blind-mode privacy (search ignored and
 * contact masked), and out-of-range page behavior.
 * Skips unless DATABASE_URL is set.
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

/** Seven distinct candidates: unique filename, email, phone. */
const PEOPLE = [
  { file: "alice-johnson.txt", email: "alice.johnson@example.com", phone: "+1 415 555 0101" },
  { file: "bob-marsh.txt", email: "bob.marsh@example.com", phone: "+1 415 555 0102" },
  { file: "carla-nunez.txt", email: "carla.nunez@example.com", phone: "+1 415 555 0103" },
  { file: "dinesh-patel.txt", email: "dinesh.patel@example.com", phone: "+1 415 555 0104" },
  { file: "emily-chen.txt", email: "emily.chen@example.com", phone: "+1 415 555 0105" },
  { file: "farid-rahimi.txt", email: "farid.rahimi@example.com", phone: "+1 415 555 0106" },
  { file: "grace-obi.txt", email: "grace.obi@example.com", phone: "+1 415 555 0107" },
];

function resumeFor(p: (typeof PEOPLE)[number]): string {
  return [
    p.file
      .replace(".txt", "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()),
    `Email: ${p.email} | Phone: ${p.phone}`,
    "",
    "EXPERIENCE",
    "Backend Engineer - Example Corp - 2022 - Present",
    "- Built and maintained REST APIs in TypeScript.",
  ].join("\n");
}

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: createMockModel({ args: { criteria: [] } }).model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Candidates Tester",
      email: `cands-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Candidates Org", slug: `cands-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("candidates list pagination + search", () => {
  let jobId = "";

  it("uploads seven distinct resumes", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Pipeline Job", description: "Pagination test job." }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    for (const p of PEOPLE) {
      const form = new FormData();
      form.append("file", new File([resumeFor(p)], p.file, { type: "text/plain" }));
      const up = await app.request(`/api/jobs/${jobId}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(up.status).toBe(201);
    }
  });

  it("returns total across pages and honors pageSize", async () => {
    const p1 = await app.request(`/api/jobs/${jobId}/candidates?page=1&pageSize=3`, {
      headers: authHeaders,
    });
    expect(p1.status).toBe(200);
    const body1 = (await p1.json()) as {
      candidates: unknown[];
      total: number;
      page: number;
      pageSize: number;
    };
    expect(body1.total).toBe(7);
    expect(body1.candidates.length).toBe(3);
    expect(body1.page).toBe(1);
    expect(body1.pageSize).toBe(3);

    const p3 = await app.request(`/api/jobs/${jobId}/candidates?page=3&pageSize=3`, {
      headers: authHeaders,
    });
    const body3 = (await p3.json()) as { candidates: unknown[] };
    expect(body3.candidates.length).toBe(1); // 3 + 3 + 1
  });

  it("returns an empty page (but the true total) past the end", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates?page=99`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: unknown[]; total: number };
    expect(body.candidates.length).toBe(0);
    expect(body.total).toBe(7);
  });

  it("searches by email, phone, and filename", async () => {
    const byEmail = await app.request(
      `/api/jobs/${jobId}/candidates?q=${encodeURIComponent("dinesh.patel@")}`,
      { headers: authHeaders },
    );
    const emailBody = (await byEmail.json()) as {
      candidates: Array<{ contactEmail: string | null }>;
      total: number;
    };
    expect(emailBody.total).toBe(1);
    expect(emailBody.candidates[0]?.contactEmail).toBe("dinesh.patel@example.com");

    const byPhone = await app.request(
      `/api/jobs/${jobId}/candidates?q=${encodeURIComponent("555 0107")}`,
      { headers: authHeaders },
    );
    const phoneBody = (await byPhone.json()) as { total: number };
    expect(phoneBody.total).toBe(1);

    const byFile = await app.request(`/api/jobs/${jobId}/candidates?q=alice`, {
      headers: authHeaders,
    });
    const fileBody = (await byFile.json()) as { total: number };
    expect(fileBody.total).toBe(1);
  });

  it("ignores search in blind mode and masks identity fields", async () => {
    const res = await app.request(`/api/jobs/${jobId}/candidates?blind=1&q=alice`, {
      headers: authHeaders,
    });
    const body = (await res.json()) as {
      candidates: Array<{
        sourceFileKey: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
      }>;
      total: number;
    };
    // Blind mode: q is ignored (searching for "alice" must not reveal
    // whether an Alice exists), so all 7 rows come back, masked.
    expect(body.total).toBe(7);
    for (const row of body.candidates) {
      expect(row.sourceFileKey).toBeNull();
      expect(row.contactEmail).toBeNull();
      expect(row.contactPhone).toBeNull();
    }
  });
});
