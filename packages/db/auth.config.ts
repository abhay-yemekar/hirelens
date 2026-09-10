import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema.js";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5433/hirelens",
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
  plugins: [organization()],
});
