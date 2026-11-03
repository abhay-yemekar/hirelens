/**
 * Resume Doctor API (phase 2 flagship, candidate-side).
 *
 * POST /api/doctor       — run the deterministic doctor over raw resume
 *                          text, persist a history row, return the report
 *                          plus the caller's score history for that text.
 * POST /api/doctor/file  — the same for an uploaded PDF, DOCX, TXT or MD
 *                          file; also returns the extracted text, since
 *                          the report's offsets point into it.
 * GET  /api/doctor       — org-wide history (newest first).
 * DELETE /api/doctor/:id — remove a history entry (org-scoped).
 *
 * The engine is pure: no LLM, no I/O during evaluation. The DB write is a
 * history record only — the report is computed before anything is written,
 * so a history failure can never change a score. The candidate uploads
 * their resume; the same scope grammar as other candidate-side tables
 * (contentHash = sha-256 of the analyzed text) applies for dedupe/grouping.
 */

import {
  ExtractionError,
  extractDocument,
  isDoctorInputEnough,
  MAX_DOCUMENT_BYTES,
  runResumeDoctor,
  textHash,
} from "@candidlens/core";
import { type Database, doctorReports } from "@candidlens/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AuthContext,
  ROLE_MIN,
  requireAuth,
  resolveAuthContext,
  sessionUserId,
} from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";

/** Longest resume text the Doctor analyzes, typed or extracted. */
const MAX_TEXT_CHARS = 200_000;

const AnalyzeSchema = z
  .object({
    text: z.string().min(1).max(MAX_TEXT_CHARS),
  })
  .strip();

const TOO_SHORT = {
  ok: false,
  error: "text_too_short",
  message: "Resume text is too short to analyze — need at least 120 non-whitespace characters.",
} as const;

/** Rows the GET history endpoint hands back (no findings payload — size). */
interface DoctorHistoryRow {
  id: string;
  textHash: string;
  score: number;
  band: string;
  createdAt: string;
  findingCount: number;
}

/**
 * Run the engine, then record history. The engine is the source of truth:
 * compute FIRST, persist AFTER, so a failed history write cannot alter an
 * already-computed report. Callers outside an organization get no history.
 */
async function diagnose(db: Database, authc: AuthContext | null, text: string) {
  const report = runResumeDoctor(text);
  const hash = textHash(text);
  if (authc === null) return { report, history: [] as DoctorHistoryRow[] };

  // History row: informational only. Never blocks the response.
  await db
    .insert(doctorReports)
    .values({
      orgId: authc.orgId,
      createdBy: authc.userId,
      textHash: hash,
      score: report.score,
      band: report.band,
      findings: report.findings as unknown as Array<Record<string, unknown>>,
      nextSteps: report.nextSteps,
    })
    .catch(() => undefined);

  // That same text's score history for this org (newest first), so the
  // caller can immediately show "how has this resume trended?".
  const history = await db
    .select({
      id: doctorReports.id,
      textHash: doctorReports.textHash,
      score: doctorReports.score,
      band: doctorReports.band,
      createdAt: doctorReports.createdAt,
      findingCount: doctorReports.findings,
    })
    .from(doctorReports)
    .where(and(eq(doctorReports.orgId, authc.orgId), eq(doctorReports.textHash, hash)))
    .orderBy(desc(doctorReports.createdAt))
    .limit(10)
    .catch(() => []);

  return {
    report,
    history: history.map(
      (h): DoctorHistoryRow => ({
        id: h.id,
        textHash: h.textHash,
        score: h.score,
        band: h.band,
        createdAt: h.createdAt.toISOString(),
        findingCount: Array.isArray(h.findingCount) ? h.findingCount.length : 0,
      }),
    ),
  };
}

export function doctorRoutes() {
  const routes = new Hono<AppEnv>();

  // Candidates use the Doctor without a workspace: any signed-in user gets a
  // report, and history is saved and returned only inside an organization.
  routes.post("/doctor", async (c) => {
    const db = c.get("db");
    if (sessionUserId(c.get("session")) === null) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    const authc = await resolveAuthContext(db, c.get("session"));

    const parsed = AnalyzeSchema.safeParse(await readJson(c).catch(() => null));
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: "invalid_body",
          message: "JSON body must include a non-empty `text` string (max 200,000 chars).",
        },
        400,
      );
    }
    const text = parsed.data.text;
    if (!isDoctorInputEnough(text)) return c.json(TOO_SHORT, 422);

    return c.json({ ok: true, ...(await diagnose(db, authc, text)) });
  });

  // Same rules as POST /doctor, for a file. The text is extracted in
  // memory and only its hash is stored, as for pasted text.
  routes.post("/doctor/file", async (c) => {
    const db = c.get("db");
    if (sessionUserId(c.get("session")) === null) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    const authc = await resolveAuthContext(db, c.get("session"));

    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return c.json(
        {
          ok: false,
          error: "invalid_body",
          message: "Send multipart/form-data with a `file` part.",
        },
        400,
      );
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return c.json(
        {
          ok: false,
          error: "file_too_large",
          message: `${file.name} is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
        },
        413,
      );
    }

    let text: string;
    try {
      const extracted = await extractDocument(new Uint8Array(await file.arrayBuffer()), file.name);
      text = extracted.needsOcr ? "" : extracted.pages.join("\n\n").trim();
    } catch (err) {
      if (!(err instanceof ExtractionError)) throw err;
      return c.json(
        {
          ok: false,
          error: "unreadable_document",
          message: `${file.name}: use a PDF, Word (.docx), .txt or .md file.`,
        },
        422,
      );
    }
    if (text === "") {
      return c.json(
        {
          ok: false,
          error: "unreadable_document",
          message: `${file.name} has no selectable text (a scanned PDF?). Export it as a text-based PDF or Word file, or paste the text.`,
        },
        422,
      );
    }
    if (text.length > MAX_TEXT_CHARS) {
      return c.json(
        {
          ok: false,
          error: "text_too_large",
          message: `${file.name} has more than 200,000 characters of text.`,
        },
        413,
      );
    }
    if (!isDoctorInputEnough(text)) return c.json(TOO_SHORT, 422);

    return c.json({ ok: true, text, ...(await diagnose(db, authc, text)) });
  });

  routes.get("/doctor", requireAuth(ROLE_MIN.view), async (c) => {
    const db = c.get("db");
    const authc = c.get("auth");
    const hash = c.req.query("hash");

    const rows = await db
      .select({
        id: doctorReports.id,
        textHash: doctorReports.textHash,
        score: doctorReports.score,
        band: doctorReports.band,
        createdAt: doctorReports.createdAt,
        findings: doctorReports.findings,
        createdBy: doctorReports.createdBy,
      })
      .from(doctorReports)
      .where(
        hash && hash.length > 0
          ? and(eq(doctorReports.orgId, authc.orgId), eq(doctorReports.textHash, hash))
          : eq(doctorReports.orgId, authc.orgId),
      )
      .orderBy(desc(doctorReports.createdAt))
      .limit(50);

    return c.json({
      ok: true,
      history: rows.map((r) => ({
        id: r.id,
        textHash: r.textHash,
        score: r.score,
        band: r.band,
        createdAt: r.createdAt.toISOString(),
        findingCount: Array.isArray(r.findings) ? r.findings.length : 0,
        createdBy: r.createdBy,
      })),
    });
  });

  routes.delete("/doctor/:id", requireAuth(ROLE_MIN.edit), async (c) => {
    const db = c.get("db");
    const authc = c.get("auth");
    const [removed] = await db
      .delete(doctorReports)
      .where(
        and(eq(doctorReports.id, c.req.param("id") ?? ""), eq(doctorReports.orgId, authc.orgId)),
      )
      .returning({ id: doctorReports.id });
    if (!removed) return c.json({ ok: false, error: "not_found" }, 404);
    return c.json({ ok: true, removed: removed.id });
  });

  return routes;
}
