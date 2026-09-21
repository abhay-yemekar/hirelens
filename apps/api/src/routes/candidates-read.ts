import { candidates, decisions, documents } from "@hirelens/db";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { Hono } from "hono";
import { blindView } from "../blind.js";
import type { AppEnv } from "../types.js";
import { loadOrgJob } from "./jobs.js";

/** Candidate read routes, mounted at /api/jobs/:jobId/candidates. */
export function candidateReadRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /**
   * List candidates for the job (no raw text — that is the detail endpoint).
   * Paginated (server-side; the UI never fetches the whole corpus) with an
   * optional `q` search across uploaded filename, email, and phone — the
   * "find one person out of hundreds" path. Content search lives on /search.
   */
  routes.get("/", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    // Blind mode never filters by identity: matching rows would confirm a
    // candidate with that name/email exists, which is itself a leak.
    const blind = c.req.query("blind") === "1";
    const q = blind ? "" : (c.req.query("q") ?? "").trim().slice(0, 200);

    const filters = [eq(candidates.jobId, job.id)];
    if (q.length > 0) {
      const like = `%${q}%`;
      const match = or(
        ilike(candidates.sourceFileKey, like),
        ilike(candidates.contactEmail, like),
        ilike(candidates.contactPhone, like),
      );
      if (match) filters.push(match);
    }
    const condition = filters.length === 1 ? filters[0] : and(...filters);

    const totalRows = await db.select({ total: count() }).from(candidates).where(condition);
    const total = totalRows[0]?.total ?? 0;

    const rows = await db
      .select({
        id: candidates.id,
        language: candidates.language,
        sourceFileKey: candidates.sourceFileKey,
        contactEmail: candidates.contactEmail,
        contactPhone: candidates.contactPhone,
        createdAt: candidates.createdAt,
        pageCount: documents.pageCount,
      })
      .from(candidates)
      .leftJoin(documents, eq(documents.candidateId, candidates.id))
      .where(condition)
      .orderBy(desc(candidates.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    // Blind review masks contact info and filenames (the review queue
    // drives it with ?blind=1).
    const out = blind
      ? rows.map((r) => ({ ...r, sourceFileKey: null, contactEmail: null, contactPhone: null }))
      : rows;
    return c.json({ ok: true, candidates: out, total, page, pageSize });
  });

  /** Candidate detail: parsed profile + full document text + decisions. */
  routes.get("/:candidateId", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);

    const candidateId = c.req.param("candidateId") ?? "";
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);
    if (!candidate || candidate.jobId !== job.id) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    const docs = await db
      .select({
        id: documents.id,
        kind: documents.kind,
        rawText: documents.rawText,
        pageCount: documents.pageCount,
        layoutMeta: documents.layoutMeta,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.candidateId, candidate.id));

    // Blind review: `?blind=1` masks identity cues server-side. Masking
    // preserves character length so evidence spans stay aligned. Contact
    // info and the uploaded-filename label are withheld with the rest —
    // contact details are the strongest identity cue a resume has.
    const blind = c.req.query("blind") === "1";
    const masked = blind ? docs.map((d) => ({ ...d, rawText: blindView(d.rawText) })) : docs;
    const candidateOut = blind
      ? { ...candidate, sourceFileKey: null, contactEmail: null, contactPhone: null }
      : candidate;

    const decisionRows = await db
      .select()
      .from(decisions)
      .where(eq(decisions.candidateId, candidate.id))
      .orderBy(desc(decisions.decidedAt));

    return c.json({
      ok: true,
      candidate: candidateOut,
      documents: masked,
      decisions: decisionRows,
    });
  });

  /**
   * Serve the original uploaded resume (the eye button). Org-scoped;
   * hidden during blind review — the original file contains identity
   * cues (name, email, address), so blind mode gets a 404, same as the
   * masked text view.
   */
  routes.get("/:candidateId/resume", async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const job = await loadOrgJob(db, c.req.param("jobId"), auth.orgId);
    if (!job) return c.json({ ok: false, error: "not_found" }, 404);
    if (c.req.query("blind") === "1") {
      return c.json({ ok: false, error: "blind_review_active" }, 404);
    }

    const candidateId = c.req.param("candidateId") ?? "";
    const [candidate] = await db
      .select({
        id: candidates.id,
        jobId: candidates.jobId,
        sourceFileKey: candidates.sourceFileKey,
      })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);
    if (!candidate || candidate.jobId !== job.id) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    const [doc] = await db
      .select({ fileBytes: documents.fileBytes, fileMime: documents.fileMime })
      .from(documents)
      .where(eq(documents.candidateId, candidate.id))
      .limit(1);
    if (!doc?.fileBytes) {
      return c.json({ ok: false, error: "file_unavailable" }, 404);
    }

    const bytes = Buffer.from(doc.fileBytes, "base64");
    const filename = candidate.sourceFileKey ?? "resume";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.fileMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });

  return routes;
}
