import { pgEnum } from "drizzle-orm/pg-core";

/** Organization-level roles (RBAC). */
export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "recruiter",
  "hiring_manager",
  "viewer",
]);

/** Job lifecycle. */
export const jobStatusEnum = pgEnum("job_status", ["draft", "open", "closed"]);

/** Candidate pipeline stage after review. */
export const stageEnum = pgEnum("stage", ["new", "shortlisted", "advanced", "rejected"]);

/** Lifecycle of a batch scoring run. */
export const scoringRunStatusEnum = pgEnum("scoring_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

/** Document kinds stored per candidate. */
export const documentKindEnum = pgEnum("document_kind", ["resume", "cover_letter", "portfolio"]);
