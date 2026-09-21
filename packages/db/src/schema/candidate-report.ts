import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../auth-schema.js";
import { candidates } from "./candidates.js";

/**
 * Candidate report links (v1.1) — candidate-side transparency.
 *
 * A per-candidate, token-gated URL the candidate opens (no account) to see
 * their own screening outcome: per-criterion scores with the quoted evidence
 * behind them, plus the rubric's anchors. The report never shows other
 * candidates, contact info, files, or demographics. Same security grammar
 * as share/portal links: opaque 256-bit token, shown once, instant revoke,
 * read-counted, hash-chain audited.
 */
export const candidateReportLinks = pgTable(
  "candidate_report_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    /** Opaque bearer token (base64url) — the URL is /report/<token>. */
    token: text("token").notNull(),
    /** Optional recruiter note shown to the candidate (≤500 chars). */
    message: text("message"),
    /** Soft revoke — instant. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** better-auth user ids are TEXT — mirror audit_log.actor_id. */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** How many times the candidate opened their report. */
    readCount: integer("read_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("candidate_report_links_token_idx").on(t.token),
    index("candidate_report_links_candidate_idx").on(t.candidateId),
  ],
);
