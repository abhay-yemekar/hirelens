/**
 * Public parser API (v1.4) — POST /api/public/parse.
 *
 * The stateless integration surface promised on the roadmap: parse one
 * resume (multipart file or raw text) into the same JSON-Resume-compatible
 * profile the product's ingest pipeline produces — using an org API token
 * (the same `hl_…` credentials the ATS webhook uses) and storing nothing.
 * We parse and hand the profile back; the only database write is the
 * token's lastUsedAt.
 *
 * Rate limited per token (fixed 60-second window, per warm instance —
 * HIRELENS_PARSE_RATE_LIMIT, default 60/min). 429 responses carry
 * Retry-After plus X-RateLimit-* headers.
 *
 * Privacy posture: the caller's document is processed in memory and
 * discarded — this endpoint can never leak stored candidate data because
 * it cannot read any.
 */

import {
  type Candidate,
  type ExtractedDocument,
  ExtractionError,
  extractDocument,
  MAX_DOCUMENT_BYTES,
  parseCandidate,
  textHash,
} from "@hirelens/core";
import { Hono } from "hono";
import { authenticateToken } from "../token-auth.js";
import type { AppEnv } from "../types.js";

/** Raw-text body cap for the JSON variant (same order as a big resume). */
const MAX_TEXT_CHARS = 200_000;

/** Fixed-window rate buckets, keyed by token id (per warm instance). */
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;

function rateLimit(tokenId: string): { ok: boolean; retryAfter: number; limit: number } {
  const limit = Number(process.env["HIRELENS_PARSE_RATE_LIMIT"] ?? "") || 60;
  const now = Date.now();
  const bucket = buckets.get(tokenId);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(tokenId, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 10_000) {
      // Prune expired buckets so the map stays bounded on long-lived workers.
      for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
    }
    return { ok: true, retryAfter: 0, limit };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)), limit };
  }
  return { ok: true, retryAfter: 0, limit };
}

/** Human-readable warnings derived from the extraction + parse result. */
function warningsFor(
  extracted: ExtractedDocument,
  parsed: ReturnType<typeof parseCandidate>,
): string[] {
  const warnings: string[] = [];
  if (extracted.layoutHints.lowTextDensity) {
    warnings.push(
      "Low text density — the document may use multi-column layout or tables; check work/education entries for merged lines.",
    );
  }
  if (parsed.email === null) warnings.push("No email address detected.");
  if (parsed.phone === null) warnings.push("No phone number detected.");
  if (parsed.work.length === 0) warnings.push("No experience section detected.");
  return warnings;
}

export function publicParseRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/public/parse", async (c) => {
    const db = c.get("db");
    const auth = await authenticateToken(db, c.req.header("authorization"));
    if (!auth) {
      return c.json(
        {
          ok: false,
          error: "invalid_token",
          message: "Provide an org API token as `Authorization: Bearer hl_…`.",
        },
        401,
      );
    }

    const limit = rateLimit(auth.tokenId);
    if (!limit.ok) {
      return c.json(
        {
          ok: false,
          error: "rate_limited",
          message: `Rate limit of ${limit.limit} requests/minute exceeded.`,
        },
        429,
        {
          "Retry-After": String(limit.retryAfter),
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": "0",
        },
      );
    }

    // Two input shapes: a multipart file, or JSON { text }.
    const contentType = c.req.header("content-type") ?? "";
    let bytes: Uint8Array | null = null;
    let filename = "resume.txt";
    let rawText: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      let form: Record<string, unknown>;
      try {
        form = await c.req.parseBody();
      } catch {
        return c.json(
          { ok: false, error: "invalid_body", message: "Malformed multipart body." },
          400,
        );
      }
      const file = form["file"];
      if (!(file instanceof File)) {
        return c.json(
          {
            ok: false,
            error: "invalid_body",
            message: "Multipart body must include a `file` part.",
          },
          400,
        );
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        return c.json(
          {
            ok: false,
            error: "file_too_large",
            message: `File exceeds the ${MAX_DOCUMENT_BYTES} byte limit.`,
          },
          413,
        );
      }
      bytes = new Uint8Array(await file.arrayBuffer());
      filename = file.name || filename;
    } else if (contentType.includes("application/json")) {
      let body: { text?: unknown };
      try {
        body = (await c.req.json()) as { text?: unknown };
      } catch {
        return c.json(
          { ok: false, error: "invalid_body", message: "Body is not valid JSON." },
          400,
        );
      }
      if (typeof body.text !== "string" || body.text.trim().length === 0) {
        return c.json(
          {
            ok: false,
            error: "invalid_body",
            message: "JSON body must include a non-empty `text` string.",
          },
          400,
        );
      }
      if (body.text.length > MAX_TEXT_CHARS) {
        return c.json(
          {
            ok: false,
            error: "text_too_large",
            message: `Text exceeds ${MAX_TEXT_CHARS} characters.`,
          },
          413,
        );
      }
      rawText = body.text;
    } else {
      return c.json(
        {
          ok: false,
          error: "unsupported_media_type",
          message:
            "Send multipart/form-data with a `file` part, or application/json with a `text` field.",
        },
        415,
      );
    }

    // Extract text (file inputs) and parse. Both failures are user-input
    // problems: surfaced as 422 with actionable messages.
    let kind = "txt";
    let pageCount = 1;
    let charCount = 0;
    let extracted: ExtractedDocument | null = null;

    if (bytes !== null) {
      try {
        extracted = await extractDocument(bytes, filename);
      } catch (err) {
        const code = err instanceof ExtractionError ? err.code : "extraction_failed";
        return c.json(
          {
            ok: false,
            error: "unreadable_document",
            message: `${filename}: ${code} — no extractable text (scanned PDF or unsupported format?).`,
          },
          422,
        );
      }
      rawText = extracted.pages.join("\n\n");
      kind = extracted.kind;
      pageCount = extracted.pageCount;
      charCount = extracted.charCount;
      if (extracted.needsOcr || rawText.trim().length === 0) {
        return c.json(
          {
            ok: false,
            error: "unreadable_document",
            message: `${filename} has no extractable text (scanned PDF?).`,
          },
          422,
        );
      }
    } else if (rawText !== null) {
      charCount = rawText.length;
    }

    if (rawText === null || rawText.trim().length === 0) {
      return c.json({ ok: false, error: "invalid_body", message: "Nothing to parse." }, 400);
    }

    let parsed: Candidate;
    try {
      parsed = parseCandidate(rawText);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not extract candidate data";
      return c.json(
        { ok: false, error: "low_information", message: `${filename}: ${message}` },
        422,
      );
    }

    return c.json({
      ok: true,
      parsed,
      contentHash: textHash(rawText),
      kind,
      pageCount,
      extractedChars: charCount,
      warnings: extracted ? warningsFor(extracted, parsed) : [],
      // Attribution only — no candidate data is stored anywhere.
      organizationId: auth.orgId,
    });
  });

  return routes;
}
