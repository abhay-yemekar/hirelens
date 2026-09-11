"use client";

import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { AUTH_BASE_URL } from "./env";

/** Better-auth client bound to the API origin (cookie-scoped there). */
export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession, organization } = authClient;
