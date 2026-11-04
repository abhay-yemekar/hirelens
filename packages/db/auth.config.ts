import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema.js";
import { resolveAuthSecret } from "./src/auth-secret.js";
import { createEmailCap } from "./src/email-cap.js";
import {
  CONFIRM_LINK_HOURS,
  confirmEmailMessage,
  passwordResetMessage,
  RESET_LINK_HOURS,
  sendMail,
} from "./src/mail.js";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5433/hirelens",
});

const db = drizzle(pool);

const claimEmail = createEmailCap(db);

// HireLens access statements — shared by every role definition below.
const ac = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
});

export const auth = betterAuth({
  appName: "hirelens",
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
  secret: resolveAuthSecret(process.env),
  database: drizzleAdapter(drizzle(pool), {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
    // Better Auth swallows and logs errors from this callback, so a failed
    // or refused send still answers "check your email" and reveals nothing.
    sendResetPassword: async ({ user, url }) => {
      await claimEmail("reset", user.email);
      await sendMail(passwordResetMessage(user.email, url));
    },
    resetPasswordTokenExpiresIn: RESET_LINK_HOURS * 60 * 60,
    // A reset signs the account out everywhere: whoever had a session (or
    // knew the old password) is out.
    revokeSessionsOnPasswordReset: true,
    // The reset link reached this inbox, which proves the address is the
    // user's, so it counts as confirmed.
    onPasswordReset: async ({ user }) => {
      if (user.emailVerified) return;
      await db
        .update(authSchema.user)
        .set({ emailVerified: true })
        .where(eq(authSchema.user.id, user.id));
    },
  },
  // Sign-up sends a confirmation link; signing in does not wait for it, so
  // accounts made before confirmation existed keep working.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await claimEmail("confirm", user.email);
      await sendMail(confirmEmailMessage(user.email, url));
    },
    sendOnSignUp: true,
    // The link only confirms the address. Signing in from it would let
    // someone send their own link to another person and, when it is
    // opened, swap that person's browser onto their account.
    autoSignInAfterVerification: false,
    expiresIn: CONFIRM_LINK_HOURS * 60 * 60,
  },
  account: {
    accountLinking: {
      // Google or GitHub never joins an existing account on its own, even
      // when the emails match: someone could register a stranger's email
      // with a password, get it confirmed (mail scanners open links), and
      // share the account once the owner signs in with Google. Connecting
      // happens only from Settings, signed in to the account.
      disableImplicitLinking: true,
    },
  },
  // `track` powers the one-time post-signup chooser ("I hire" /
  // "I'm a candidate"). Nullable until the user picks; client-writable via
  // updateUser so the chooser can record the choice without a server round
  // trip of its own.
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
  // Origins allowed to initiate auth flows and receive post-login
  // redirects (the web app may run on :3000, :3001 or :5173 in dev).
  // Mirrors the API's CORS_ORIGINS list.
  trustedOrigins: (
    process.env["TRUSTED_ORIGINS"] ??
    process.env["CORS_ORIGINS"] ??
    "http://localhost:3000,http://localhost:3001,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  socialProviders: {
    github: {
      clientId: process.env["GITHUB_CLIENT_ID"] ?? "",
      clientSecret: process.env["GITHUB_CLIENT_SECRET"] ?? "",
      enabled: Boolean(process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]),
    },
    google: {
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
      enabled: Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]),
    },
  },
  plugins: [
    organization({
      // HireLens role hierarchy (mirrors apps/api ROLE_RANK). Registered so
      // invites/role-changes validate: better-auth only accepts roles it
      // knows about (its defaults are admin/member/owner).
      ac: ac,
      roles: {
        owner: ac.newRole({
          organization: ["update", "delete"],
          member: ["create", "update", "delete"],
          invitation: ["create", "cancel"],
          team: ["create", "update", "delete"],
          ac: ["create", "read", "update", "delete"],
        }),
        recruiter: ac.newRole({
          organization: ["update"],
          member: ["create"],
          invitation: ["create", "cancel"],
          team: [],
          ac: ["read"],
        }),
        hiring_manager: ac.newRole({
          organization: [],
          member: [],
          invitation: [],
          team: [],
          ac: ["read"],
        }),
        viewer: ac.newRole({
          organization: [],
          member: [],
          invitation: [],
          team: [],
          ac: ["read"],
        }),
      },
    }),
  ],
});
