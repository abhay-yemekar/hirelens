import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "../../auth-schema.js";
import { candidates } from "./candidates.js";

/**
 * Append-only, hash-chained audit log. Rows are never updated or deleted;
 * the prevHash -> hash chain is verified in application code
 * (@hirelens/core AuditChain).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.seq)],
);

/**
 * Self-reported demographics, strictly opt-in. Isolated table, never joined
 * into scoring queries; read only by the bias-audit reporter.
 */
export const demographics = pgTable("demographics", {
  candidateId: uuid("candidate_id")
    .primaryKey()
    .references(() => candidates.id, { onDelete: "cascade" }),
  selfReported: jsonb("self_reported").$type<Record<string, unknown>>().notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
});
