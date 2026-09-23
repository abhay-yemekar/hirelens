/**
 * API tokens (v1.2) — create/list/revoke machine credentials for ATS
 * integrations. The raw token is shown exactly once at creation; only its
 * SHA-256 hash is stored. Owner-only management (same bar as deleting a
 * job), and every mutation is audited.
 */

import { createHash, randomBytes } from "node:crypto";
import { apiTokens } from "@hirelens/db";
import { appendAudit } from "@hirelens/orchestrator";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ROLE_MIN, requireAuth } from "../auth.js";
import { readJson } from "../http.js";
import type { AppEnv } from "../types.js";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint an opaque 256-bit token, formatted `hl_<base64url>`. */
export function mintToken(): { raw: string; hash: string; last4: string } {
  const raw = `hl_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashToken(raw), last4: raw.slice(-4) };
}

const CreateTokenSchema = z.object({
  label: z.string().min(1).max(80),
});

export function tokenRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** List this org's tokens (metadata only — never the raw secret). */
  routes.get("/", requireAuth(ROLE_MIN.admin), async (c) => {
    const rows = await c
      .get("db")
      .select({
        id: apiTokens.id,
        label: apiTokens.label,
        last4: apiTokens.last4,
        revokedAt: apiTokens.revokedAt,
        createdAt: apiTokens.createdAt,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.orgId, c.get("auth").orgId))
      .orderBy(desc(apiTokens.createdAt));
    return c.json({ ok: true, tokens: rows });
  });

  /** Create a token. The raw value is returned exactly once. */
  routes.post("/", requireAuth(ROLE_MIN.admin), async (c) => {
    const parsed = CreateTokenSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ ok: false, error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const auth = c.get("auth");
    const minted = mintToken();
    const [row] = await c
      .get("db")
      .insert(apiTokens)
      .values({
        orgId: auth.orgId,
        tokenHash: minted.hash,
        last4: minted.last4,
        label: parsed.data.label,
        createdBy: auth.userId,
      })
      .returning({ id: apiTokens.id, createdAt: apiTokens.createdAt });
    if (row === undefined) return c.json({ ok: false, error: "insert_failed" }, 500);
    await appendAudit(c.get("db"), {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "api_token.created",
      payload: { tokenId: row.id, label: parsed.data.label },
    });
    return c.json({ ok: true, token: { ...row, raw: minted.raw, last4: minted.last4 } }, 201);
  });

  /** Revoke instantly — the webhook checks revokedAt on every call. */
  routes.delete("/:id", requireAuth(ROLE_MIN.admin), async (c) => {
    const db = c.get("db");
    const auth = c.get("auth");
    const [row] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(apiTokens.id, c.req.param("id")),
          eq(apiTokens.orgId, auth.orgId),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id });
    if (row === undefined) return c.json({ ok: false, error: "not_found" }, 404);
    await appendAudit(db, {
      orgId: auth.orgId,
      actorId: auth.userId,
      action: "api_token.revoked",
      payload: { tokenId: row.id },
    });
    return c.json({ ok: true });
  });

  return routes;
}
