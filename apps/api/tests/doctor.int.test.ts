/**
 * Resume Doctor route integration test: run the engine + persist history.
 * Skips unless DATABASE_URL is set.
 */

import type { DoctorReport } from "@hirelens/core";
import { auth, createDb, type Database, doctorReports } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { deleteOrgCompletely } from "./helpers.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let db: Database;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();

/** Deliberately weak resume: no email, no dates, weak verbs -> lots of flags. */
const WEAK_RESUME = [
  "Responsible for various backend things at a company",
  "helped with the database and other duties included reviewing code",
  "no metrics here just general work on systems day to day",
  "worked on improving things where possible over time",
].join("\n");

/** Healthier resume: contact, sections, dates, metric bullet. */
const GOOD_RESUME = [
  "Priya Sharma",
  "priya.sharma@example.com | +91 98200 12345",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
  "",
  "SKILLS",
  "TypeScript, Node.js, PostgreSQL, Kubernetes",
].join("\n");

const SPAM = "x".repeat(50);

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  app = createApp({ db, llm: null });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Doctor Tester",
      email: `doctor-test-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Doctor Org", slug: `doctor-${STAMP}` },
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
  if (orgId !== "") await deleteOrgCompletely(db, orgId);
});

describe.skipIf(!available && allowSkip)("doctor route", () => {
  it("rejects anonymous callers", async () => {
    const res = await app.request("/api/doctor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: GOOD_RESUME }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid/too-short bodies", async () => {
    const bad = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: SPAM }),
    });
    expect(bad.status).toBe(422);

    const empty = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  // Regression: the Doctor is candidate-side, but the route demanded an
  // active organization, so every signed-in candidate got a 401.
  it("serves a signed-in candidate without an organization and saves nothing", async () => {
    const email = `doctor-candidate-${STAMP}@example.com`;
    const signUp = await auth.api.signUpEmail({
      body: { name: "Doctor Candidate", email, password: "Str0ng-Passw0rd!123" },
      returnHeaders: true,
    });
    const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
    const res = await app.request("/api/doctor", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ text: GOOD_RESUME }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; report: DoctorReport; history: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.report.score).toBeGreaterThan(0);
    expect(body.history).toEqual([]);
    const userId = signUp.response.user.id;
    const saved = await db
      .select({ id: doctorReports.id })
      .from(doctorReports)
      .where(eq(doctorReports.createdBy, userId));
    expect(saved).toHaveLength(0);
  });

  it("returns a deterministic report, scores and persists history", async () => {
    const res = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: GOOD_RESUME }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; report: DoctorReport; history: unknown[] };
    expect(body.ok).toBe(true);
    expect(typeof body.report.score).toBe("number");
    expect(body.report.score).toBeGreaterThanOrEqual(0);
    expect(body.report.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(body.report.findings)).toBe(true);
    expect(Array.isArray(body.report.nextSteps)).toBe(true);
    // Same text, same score — the engine's determinism contract.
    const res2 = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: GOOD_RESUME }),
    });
    const body2 = (await res2.json()) as { report: DoctorReport; history: unknown[] };
    expect(body2.report.score).toBe(body.report.score);

    // History persisted: at least 2 rows for this text now.
    const rows = await db.select().from(doctorReports).where(eq(doctorReports.orgId, orgId));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(body2.history.length).toBeGreaterThanOrEqual(2);
  });

  it("a weak resume scores worse than a good one", async () => {
    const weak = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: WEAK_RESUME }),
    });
    expect(weak.status).toBe(200);
    const weakBody = (await weak.json()) as { report: DoctorReport };
    const good = await app.request("/api/doctor", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: GOOD_RESUME }),
    });
    const goodBody = (await good.json()) as { report: DoctorReport };
    expect(goodBody.report.score).toBeGreaterThan(weakBody.report.score);
    expect(weakBody.report.findings.length).toBeGreaterThan(goodBody.report.findings.length);
  });

  it("GET returns org-scoped history and DELETE removes a row", async () => {
    const res = await app.request("/api/doctor", { headers: authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { history: Array<{ id: string; score: number }> };
    expect(body.history.length).toBeGreaterThanOrEqual(3);
    const first = body.history[0];
    if (!first) throw new Error("expected at least one history row");

    const del = await app.request(`/api/doctor/${first.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request("/api/doctor", { headers: authHeaders });
    const afterBody = (await after.json()) as { history: Array<{ id: string }> };
    expect(afterBody.history.some((h) => h.id === first.id)).toBe(false);

    // Deleting a nonexistent id is a 404, not a 500.
    const missing = await app.request(`/api/doctor/${crypto.randomUUID()}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(missing.status).toBe(404);
  });
});
