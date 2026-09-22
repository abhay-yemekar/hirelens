import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "../../auth-schema.js";
import { jobs } from "./jobs.js";

/**
 * Scheduled bias-audit snapshots (v1.2).
 *
 * One row per (job, dimension) per snapshot run — taken by the cron
 * endpoint (Vercel Cron / any scheduler with the shared secret) or
 * on-demand. The trend across snapshots is what the analytics dashboard
 * charts; the snapshot also lands in the regular audit log so the
 * hash chain records every scheduled run.
 *
 * `outcome` shape (stable contract for trend charts):
 * { allPass: boolean, groups: [{ group, considered, selected, rate, ratio, flag }] }
 */
export const biasAuditSnapshots = pgTable(
  "bias_audit_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    dimension: text("dimension").notNull(),
    outcome: jsonb("outcome").$type<Record<string, unknown>>().notNull(),
    allPass: text("all_pass").notNull().default("true"),
    /** "scheduled" (cron) or "manual" (user-clicked on the job page). */
    trigger: text("trigger").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bias_audit_snapshots_job_idx").on(t.jobId, t.createdAt)],
);

export type BiasAuditSnapshot = typeof biasAuditSnapshots.$inferSelect;
