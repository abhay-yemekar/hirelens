import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "../../auth-schema.js";
import { jobs } from "./jobs.js";

/**
 * Public, read-only share links for a job's scored report.
 *
 * A link grants exactly the snapshot a recruiter chooses to publish:
 * per-candidate overall + criterion scores + evidence text excerpts.
 * No resumes, no contact info, no demographics — the token is the only
 * credential and revocation is instant (row delete / revokedAt set).
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** Opaque 256-bit token — the sole credential for the public report. */
    token: text("token").notNull(),
    /** Optional friendly label shown on the public page. */
    title: text("title"),
    /** null = active; a timestamp marks when/why it was revoked. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Retry-audit / analytics: how many times the public report was read. */
    readCount: integer("read_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("share_links_token_idx").on(t.token),
    index("share_links_job_idx").on(t.jobId),
  ],
);
