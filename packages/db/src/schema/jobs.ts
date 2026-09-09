import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "../../auth-schema.js";
import { jobStatusEnum } from "./enums.js";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: jobStatusEnum("status").notNull().default("draft"),
    /** Whether blind review is the default for this job's reviews. */
    blindReviewDefault: boolean("blind_review_default").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_org_idx").on(t.orgId)],
);

export const rubrics = pgTable(
  "rubrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** criteria jsonb mirrors the @hirelens/core criterion shape. */
    criteria: jsonb("criteria").$type<unknown[]>().notNull(),
    /** Raw rubric payload for exact reproducibility of this version. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rubrics_job_version_idx").on(t.jobId, t.version)],
);
