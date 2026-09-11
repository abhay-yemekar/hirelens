/**
 * Candidate ingest: uploaded bytes → persisted candidate + document rows.
 * Runs the core pipeline (sniff → extract → parse → hash) and stores the
 * parsed profile. Dedupe is enforced by the candidates_job_hash unique
 * index on the extracted-text hash; a duplicate upload is surfaced as
 * `duplicate` with the existing candidate id.
 */

import {
  type Candidate,
  extractDocument,
  MAX_DOCUMENT_BYTES,
  parseCandidate,
  textHash,
} from "@hirelens/core";
import type { Database } from "@hirelens/db";
import { candidates, documents } from "@hirelens/db";
import { and, eq } from "drizzle-orm";
import { ApiInputError } from "./errors.js";

export type IngestResult =
  | { status: "created"; candidateId: string; documentId: string; filename: string }
  | { status: "duplicate"; candidateId: string; filename: string };

export async function ingestBytes(
  db: Database,
  input: { jobId: string; filename: string; bytes: Uint8Array },
): Promise<IngestResult> {
  if (input.bytes.length > MAX_DOCUMENT_BYTES) {
    throw new ApiInputError(
      "file_too_large",
      `${input.filename} exceeds ${MAX_DOCUMENT_BYTES} bytes`,
      413,
    );
  }

  const extracted = await extractDocument(input.bytes, input.filename);
  const rawText = extracted.pages.join("\n\n");
  if (extracted.needsOcr || rawText.trim().length === 0) {
    throw new ApiInputError(
      "unreadable_document",
      `${input.filename} has no extractable text (scanned PDF?)`,
      422,
    );
  }

  const parsed: Candidate = parseCandidate(rawText);
  // Dedupe key: SHA-256 of the extracted text, unique per job.
  const textSha = textHash(rawText);

  const [dupe] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.jobId, input.jobId), eq(candidates.contentHash, textSha)))
    .limit(1);
  if (dupe) {
    return { status: "duplicate", candidateId: dupe.id, filename: input.filename };
  }

  const [candidate] = await db
    .insert(candidates)
    .values({
      jobId: input.jobId,
      contentHash: textSha,
      sourceFileKey: input.filename,
      language: parsed.languageTag,
      parsed: parsed as unknown as Record<string, unknown>,
    })
    .returning({ id: candidates.id });
  if (!candidate) throw new Error("candidate insert returned no row");

  const [document] = await db
    .insert(documents)
    .values({
      candidateId: candidate.id,
      kind: "resume",
      rawText,
      pageCount: extracted.pageCount,
      layoutMeta: {
        kind: extracted.kind,
        charCount: extracted.charCount,
        lowTextDensity: extracted.layoutHints.lowTextDensity,
      },
    })
    .returning({ id: documents.id });
  if (!document) throw new Error("document insert returned no row");

  return {
    status: "created",
    candidateId: candidate.id,
    documentId: document.id,
    filename: input.filename,
  };
}
