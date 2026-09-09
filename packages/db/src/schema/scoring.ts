import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../auth-schema.js";
import { candidates, documents } from "./candidates.js";
import { scoringRunStatusEnum, stageEnum } from "./enums.js";
import { jobs } from "./jobs.js";

export const scoringRuns = pgTable(
  "scoring_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** Rubric version used; the rubrics row pins the exact criteria payload. */
    rubricVersion: integer("rubric_version").notNull(),
    /** Provider-qualified model id, e.g. "openai/gpt-4o-mini". */
    modelId: text("model_id").notNull(),
    /** Provider-reported model snapshot/version string. */
    modelVersion: text("model_version"),
    /** SHA-256 of the exact prompt template used. */
    promptHash: text("prompt_hash").notNull(),
    /** Deterministic sampling seed, stored for reproducibility. */
    seed: integer("seed").notNull(),
    temperature: real("temperature").notNull().default(0),
    status: scoringRunStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("scoring_runs_job_idx").on(t.jobId)],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => scoringRuns.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    criterionKey: text("criterion_key").notNull(),
    score: real("score").notNull(),
    confidence: real("confidence"),
    rationale: text("rationale"),
    /** Override support: current authoritative value lives in `score`. */
    overriddenBy: text("overridden_by").references(() => user.id, { onDelete: "set null" }),
    overrideReason: text("override_reason"),
  },
  (t) => [
    uniqueIndex("scores_run_candidate_criterion_idx").on(t.runId, t.candidateId, t.criterionKey),
    index("scores_candidate_idx").on(t.candidateId),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scoreId: uuid("score_id")
      .notNull()
      .references(() => scores.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    quotedText: text("quoted_text").notNull(),
  },
  (t) => [index("evidence_score_idx").on(t.scoreId)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    stage: stageEnum("stage").notNull(),
    reason: text("reason").notNull(),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("decisions_candidate_idx").on(t.candidateId)],
);
