import type { Database } from "@hirelens/db";
import { member, organization } from "@hirelens/db";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types.js";

/** Role hierarchy — higher number wins. */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  hiring_manager: 1,
  recruiter: 2,
  owner: 3,
};

export function roleAtLeast(role: string, min: string): boolean {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[min] ?? 99);
}

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
  orgName: string;
}

export const ROLE_MIN = {
  view: "viewer",
  edit: "recruiter",
  admin: "owner",
} as const;

/** better-auth getSession() payload: { session, user }. */
interface SessionLike {
  user?: { id?: string | null } | null;
  session?: { activeOrganizationId?: string | null } | null;
}

/**
 * Resolve the caller's (userId, orgId, role) from the better-auth session.
 * The organization plugin stores the active org on the session; role comes
 * from the member row. Returns null for anonymous or org-less sessions.
 */
export async function resolveAuthContext(
  db: Database,
  session: unknown,
): Promise<AuthContext | null> {
  const s = session as SessionLike | null;
  const userId = s?.user?.id;
  if (typeof userId !== "string" || userId === "") return null;

  const orgId = s?.session?.activeOrganizationId;
  if (typeof orgId !== "string" || orgId === "") return null;

  const [row] = await db
    .select({ role: member.role, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1);

  if (!row) return null;
  return { userId, orgId, role: row.role, orgName: row.name };
}

/**
 * Require an authenticated member of the active organization with at
 * least the given role. Attaches AuthContext to c.var.auth.
 */
export function requireAuth(minRole: string = ROLE_MIN.view): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = c.get("db") as Database;
    const authContext = await resolveAuthContext(db, c.get("session"));
    if (!authContext) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!roleAtLeast(authContext.role, minRole)) {
      return c.json({ ok: false, error: "forbidden", needRole: minRole }, 403);
    }
    c.set("auth", authContext);
    await next();
  };
}
