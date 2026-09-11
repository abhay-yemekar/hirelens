import type { LanguageModel } from "@hirelens/core";
import type { Database } from "@hirelens/db";
import type { AuthContext } from "./auth.js";

/** Raw better-auth getSession() payload attached by the session middleware. */
export interface AuthSessionPayload {
  user: { id: string };
  session: { activeOrganizationId?: string | null | undefined };
}

/** Shared Hono environment: what middleware may set and routes may read. */
export type AppEnv = {
  Variables: {
    db: Database;
    model: LanguageModel | null;
    session: AuthSessionPayload | null;
    auth: AuthContext;
  };
};
