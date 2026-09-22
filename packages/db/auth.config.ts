import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema.js";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5433/hirelens",
});

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
  secret:
    process.env["BETTER_AUTH_SECRET"] ??
    "dev-only-secret-do-not-use-in-production-0123456789abcdef",
  database: drizzleAdapter(drizzle(pool), {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
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
