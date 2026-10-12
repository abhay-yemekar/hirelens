import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "../../auth-schema.js";

/**
 * Per-organization AI provider preference (multi-provider plan, Phase 2).
 * One row per org, created lazily on first write. The org chooses which
 * *configured* provider is the default and, optionally, a fixed fallback
 * order over the server-configured chain. API keys never live here —
 * they stay in server-side env.
 */
export const orgSettings = pgTable("org_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /**
   * Shape: { llmProvider: string | null; fallbackOrder?: string[] } —
   * provider ids from LlmProviderId, validated at the API boundary.
   */
  llmProvider: jsonb("llm_provider").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
