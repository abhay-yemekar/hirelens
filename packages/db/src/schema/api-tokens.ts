import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "../../auth-schema.js";

/**
 * API tokens (v1.2) — machine credentials for ATS integrations.
 *
 * A token belongs to exactly one organization; every request that presents
 * it inherits that org's scope (and never more). Tokens are shown once at
 * creation and stored hashed — the same posture as the public share/portal
 * tokens. Revocation is instant (revokedAt set) and auditable via the
 * normal audit trail on use.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** better-auth ids are text — match the rest of the schema. */
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** SHA-256 hash of the raw token — the raw value is never stored. */
    tokenHash: text("token_hash").notNull(),
    /** Last 4 chars of the raw token, shown in the UI for identification. */
    last4: text("last4").notNull(),
    /** Human label, e.g. "Greenhouse webhook". */
    label: text("label").notNull(),
    /** null = active; a timestamp marks revocation. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Last successful use — surfaced in Settings for rotation hygiene. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_tokens_hash_idx").on(t.tokenHash),
    index("api_tokens_org_idx").on(t.orgId),
  ],
);
