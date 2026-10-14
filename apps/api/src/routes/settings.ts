/**
 * Org AI settings (multi-provider plan, Phase 2): which configured
 * provider is the org's default, and an optional fixed fallback order
 * over the server-configured chain. Owner-only mutations, audited;
 * the connection-test endpoint probes each configured provider so the
 * Settings UI can show live availability.
 */

import { PROVIDER_LABELS } from "@hirelens/core";

/** Validated provider-ids schema (shared shape with core's LlmProviderId). */
const LlmProviderIdSchema = z.enum([
  "google",
  "anthropic",
  "groq",
  "openrouter",
  "mistral",
  "cerebras",
  "ollama",
]);

import { orgSettings } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import { isMissingTableError, sanitizeLlmConfigError } from "../llm-error.js";
import { llmProviderStatus } from "../model-status.js";
import type { AppEnv } from "../types.js";

const PutLlmSchema = z.object({
  /** Primary provider the org prefers (must be server-configured or null to reset). */
  llmProvider: LlmProviderIdSchema.nullable(),
  /** Optional explicit fallback order; entries must be distinct. */
  fallbackOrder: z.array(LlmProviderIdSchema).max(6).optional(),
});

export function settingsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** Current org LLM preference + which providers the server has configured. */
  routes.get("/llm", requireAuth(), async (c) => {
    const db = c.get("db");
    // Resilience: a deployment whose migrations haven't run yet must not
    // 500 the settings page — it gets defaults plus a flag instead.
    let stored: { llmProvider?: string | null; fallbackOrder?: string[] } | undefined;
    let migrationsPending = false;
    try {
      const [row] = await db
        .select()
        .from(orgSettings)
        .where(eq(orgSettings.orgId, c.get("auth").orgId))
        .limit(1);
      stored = row?.llmProvider as
        | { llmProvider?: string | null; fallbackOrder?: string[] }
        | undefined;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      migrationsPending = true;
    }

    const configured = llmProviderStatus().map((p) => ({
      id: p.id,
      label: p.label,
      model: p.model,
    }));
    const llmConfigError = c.get("llmConfigError");
    return c.json({
      ok: true,
      setting: {
        llmProvider: stored?.llmProvider ?? null,
        fallbackOrder: stored?.fallbackOrder ?? [],
      },
      /** Providers with a usable key/model on the server (ids only — never keys). */
      configured,
      /** Human names for the picker. */
      providerLabels: PROVIDER_LABELS,
      /** org_settings table missing — the operator hasn't run migrations. */
      migrationsPending,
      /**
       * HIRELENS_LLM_* was set but invalid — degraded mode's actual reason,
       * shown as a banner so "no providers listed" is never mysterious.
       */
      ...(llmConfigError !== null
        ? { llmConfigError: sanitizeLlmConfigError(llmConfigError) }
        : {}),
    });
  });

  /** Set the org's preferred provider (owner-only, audited). */
  routes.put("/llm", requireAuth(ROLE_MIN.admin), async (c) => {
    const parsed = PutLlmSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const { llmProvider, fallbackOrder } = parsed.data;
    const configuredIds = new Set(llmProviderStatus().map((p) => p.id));

    const requested: string[] = [...(llmProvider ? [llmProvider] : []), ...(fallbackOrder ?? [])];
    const unconfigured = requested.filter((id) => !configuredIds.has(id));
    if (unconfigured.length > 0) {
      return c.json(
        {
          ok: false,
          error: "provider_not_configured",
          message: `No server-side API key configured for: ${unconfigured.join(", ")}`,
        },
        400,
      );
    }
    if (fallbackOrder && new Set(fallbackOrder).size !== fallbackOrder.length) {
      return c.json(
        { ok: false, error: "invalid_body", message: "Fallback order entries must be distinct." },
        400,
      );
    }

    const db = c.get("db");
    const auth = c.get("auth");
    try {
      await db
        .insert(orgSettings)
        .values({
          orgId: auth.orgId,
          llmProvider: { llmProvider, fallbackOrder: fallbackOrder ?? [] },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: orgSettings.orgId,
          set: {
            llmProvider: { llmProvider, fallbackOrder: fallbackOrder ?? [] },
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      // Missing table → tell the operator exactly what to run instead of
      // an opaque 500.
      if (isMissingTableError(err)) {
        return c.json(
          {
            ok: false,
            error: "migrations_pending",
            message:
              "The org_settings table does not exist yet. Run: pnpm --filter @hirelens/db db:migrate",
          },
          503,
        );
      }
      throw err;
    }

    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "settings.llm.updated",
      payload: { llmProvider, fallbackOrder: fallbackOrder ?? [] },
    });

    return c.json({ ok: true, setting: { llmProvider, fallbackOrder: fallbackOrder ?? [] } });
  });

  /** Probe each configured provider with a tiny ping → live availability. */
  routes.post("/llm/test", requireAuth(ROLE_MIN.view), async (c) => {
    const results = await Promise.all(llmProviderStatus().map((p) => p.test()));
    return c.json({
      ok: true,
      results: results.map((r) => ({
        id: r.id,
        ok: r.ok,
        latencyMs: r.latencyMs,
        error: r.error,
      })),
    });
  });

  return routes;
}
