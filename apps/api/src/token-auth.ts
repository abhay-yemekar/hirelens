/**
 * Bearer-token authentication for the public, token-gated API surface
 * (inbound ATS webhook, public parser API). Org-scoped API tokens only:
 * SHA-256 hash lookup, revoked tokens rejected, `lastUsedAt` touched
 * best-effort so rotation hygiene is visible in Settings without ever
 * blocking the response on the write.
 */

import type { Database } from "@hirelens/db";
import { apiTokens } from "@hirelens/db";
import { and, eq, isNull } from "drizzle-orm";
import { hashToken } from "./routes/tokens.js";

export interface TokenAuth {
  orgId: string;
  tokenId: string;
}

export async function authenticateToken(
  db: Database,
  header: string | undefined,
): Promise<TokenAuth | null> {
  if (header === undefined || !header.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (raw.length < 8) return null;
  const [row] = await db
    .select({ orgId: apiTokens.orgId, tokenId: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(raw)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (row === undefined) return null;
  // Rotation hygiene: touch lastUsedAt, never block the response on it.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.tokenId))
    .catch(() => undefined);
  return row;
}
