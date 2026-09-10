import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { documentKindEnum } from "./enums.js";
import { jobs } from "./jobs.js";

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** SHA-256 of extracted text; dedupe key per job. */
    contentHash: text("content_hash").notNull(),
    sourceFileKey: text("source_file_key"),
    /** BCP-47 language tag from detection. */
    language: text("language"),
    /** JSON-Resume-compatible parsed profile. */
    parsed: jsonb("parsed").$type<Record<string, unknown>>(),
    /** Maskable PII snapshot for blind review (name, school, etc). */
    piiMasked: jsonb("pii_masked").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidates_job_hash_idx").on(t.jobId, t.contentHash),
    index("candidates_job_idx").on(t.jobId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull().default("resume"),
    rawText: text("raw_text").notNull(),
    /** Layout metadata: page count, columns, reading-order notes. */
    layoutMeta: jsonb("layout_meta").$type<Record<string, unknown>>(),
    pageCount: integer("page_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_candidate_idx").on(t.candidateId)],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (t) => [
    index("chunks_document_idx").on(t.documentId),
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);
