/**
 * Resume Doctor route integration test: run the engine + persist history.
 * Skips unless DATABASE_URL is set.
 */

import type { DoctorReport } from "@hirelens/core";
import { auth, createDb, type Database, doctorReports } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
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

/** A one-page text PDF with one resume line per text line (ASCII only). */
async function makePdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => {
    page.drawText(line, { x: 50, y: 800 - i * 16, size: 11, font });
  });
  return doc.save();
}

/** The smallest DOCX mammoth reads: one paragraph per line. */
function makeDocx(lines: string[]): Uint8Array {
  const paragraphs = lines.map((l) => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`);
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}</w:body></w:document>`,
    ),
  });
}

/** POST one file to /api/doctor/file as multipart. */
function uploadFile(
  bytes: Uint8Array,
  name: string,
  headers: Record<string, string> = authHeaders,
): Promise<Response> {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name));
  return Promise.resolve(app.request("/api/doctor/file", { method: "POST", headers, body: form }));
}

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

  describe("file upload", () => {
    const LINES = GOOD_RESUME.split("\n").filter((l) => l.trim() !== "");

    it("diagnoses a PDF and returns the text the flags point into", async () => {
      const res = await uploadFile(await makePdf(LINES), "priya-sharma.pdf");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; text: string; report: DoctorReport };
      expect(body.ok).toBe(true);
      expect(body.text).toContain("priya.sharma@example.com");
      expect(body.text).toContain("Senior Backend Engineer");
      // Same engine, same text: the file result equals a paste of its text.
      const pasted = await app.request("/api/doctor", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ text: body.text }),
      });
      const pastedBody = (await pasted.json()) as { report: DoctorReport };
      expect(body.report).toEqual(pastedBody.report);
      for (const f of body.report.findings) {
        if (f.startOffset === null || f.endOffset === null) continue;
        expect(f.endOffset).toBeLessThanOrEqual(body.text.length);
      }
    });

    it("diagnoses a Word file", async () => {
      const res = await uploadFile(makeDocx(LINES), "priya-sharma.docx");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { text: string; report: DoctorReport };
      expect(body.text).toContain("priya.sharma@example.com");
      expect(body.report.score).toBeGreaterThan(0);
    });

    it("serves a signed-in candidate without an organization", async () => {
      const signUp = await auth.api.signUpEmail({
        body: {
          name: "Doctor Upload Candidate",
          email: `doctor-upload-${STAMP}@example.com`,
          password: "Str0ng-Passw0rd!123",
        },
        returnHeaders: true,
      });
      const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
      const res = await uploadFile(await makePdf(LINES), "cv.pdf", { cookie });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { history: unknown[] };
      expect(body.history).toEqual([]);
    });

    it("rejects signed-out callers", async () => {
      const res = await uploadFile(await makePdf(LINES), "cv.pdf", {});
      expect(res.status).toBe(401);
    });

    it("explains a PDF with no selectable text", async () => {
      const res = await uploadFile(await makePdf(["scanned page"]), "scan.pdf");
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("unreadable_document");
      expect(body.message).toContain("scanned");
    });

    it("rejects formats it cannot read", async () => {
      const res = await uploadFile(strToU8("GIF89a not a resume"), "photo.gif");
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe("unreadable_document");
    });

    it("rejects a request without a file part", async () => {
      const res = await app.request("/api/doctor/file", {
        method: "POST",
        headers: authHeaders,
        body: new FormData(),
      });
      expect(res.status).toBe(400);
    });

    it("rejects a file whose text is too short to diagnose", async () => {
      const res = await uploadFile(strToU8(SPAM), "short.txt");
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toBe("text_too_short");
    });
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
