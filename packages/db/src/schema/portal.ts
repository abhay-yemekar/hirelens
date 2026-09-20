import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { candidates } from "./candidates.js";

/**
 * Wave 4 — candidate portal links.
 *
 * A per-candidate, token-gated URL the candidate can open (no account)
 * to submit an OPT-IN demographics self-report. The token is the only
 * credential, mirrors the share-links pattern: stored server-side, shown
 * once, revocable, one-shot after submission.
 */
export const portalLinks = pgTable(
  "portal_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    /** Opaque bearer token (base64url) — the URL is /portal/<token>. */
    token: text("token").notNull(),
    /** Set when the candidate submits (or explicitly skips) the form. */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    /** Soft revoke — instant, like share links. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** better-auth user ids are TEXT — mirror audit_log.actor_id. */
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("portal_links_token_idx").on(t.token),
    index("portal_links_candidate_idx").on(t.candidateId),
  ],
);
