import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "../../auth-schema.js";

/**
 * Resume Doctor reports (phase 2 flagship, candidate-side).
 *
 * Every entry is a persisted snapshot of a doctor run: total score, band,
 * findings, and the next steps that were shown. Used for (a) a candidate or
 * org to watch how their resume improved over time, and (b) a deterministic
 * baseline for auditability — the same text always yields the same report,
 * because the engine itself takes no model input.
 *
 * The scope key matches candidate_report_links / portal_links:
 * orgId + contentHash (of the exact analyzed text) -> many entries, newest
 * first. contentHash lets callers dedupe re-checks of the same text.
 */
export const doctorReports = pgTable(
  "doctor_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Owning org — mirrors the auth-schema text id and API token scope. */
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** better-auth user id (TEXT), or null for anonymous/public use. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** SHA-256 of the analyzed text, for dedupe and history grouping. */
    textHash: text("text_hash").notNull(),
    /** Deterministic 0–100 score from the doctor engine. */
    score: integer("score").notNull(),
    /** Band at the time of the run. */
    band: text("band").notNull(),
    /** Findings snapshot exactly as returned by the engine. */
    findings: jsonb("findings").$type<Array<Record<string, unknown>>>().notNull(),
    /** Next steps snapshot exactly as returned by the engine. */
    nextSteps: jsonb("next_steps").$type<Array<string>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("doctor_reports_org_created_idx").on(t.orgId, t.createdAt),
    index("doctor_reports_text_idx").on(t.textHash),
  ],
);
