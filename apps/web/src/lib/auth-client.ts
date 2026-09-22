"use client";

import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { AUTH_BASE_URL } from "./env";

/** The one-time post-signup track choice stored on the user record. */
export type UserTrack = "recruiter" | "candidate";

/** Better-auth client bound to the API origin (cookie-scoped there). */
export const authClient = createAuthClient({
  baseURL: AUTH_BASE_URL,
  plugins: [organizationClient()],
  // `track` powers the one-time post-signup chooser ("I hire" /
  // "I'm a candidate"); null = never asked. Server-side the field is
  // declared in packages/db auth config (input: true) so updateUser
  // accepts it.
  user: {
    additionalFields: {
      track: {
        type: "string",
        required: false,
        defaultValue: null,
        input: true,
      },
    },
  },
});

export const { signIn, signUp, signOut, useSession, organization, updateUser } = authClient;

/** Read the track off a session user (client types don't infer it). */
export function userTrack(
  user: ({ id: string } & Record<string, unknown>) | null | undefined,
): UserTrack | null {
  const value = user && typeof user === "object" ? user["track"] : null;
  return value === "recruiter" || value === "candidate" ? value : null;
}

/** Persist the track choice on the user record. */
export async function setUserTrack(track: UserTrack): Promise<void> {
  const updater = updateUser as unknown as (data: { track: string }) => Promise<unknown>;
  await updater({ track });
}
