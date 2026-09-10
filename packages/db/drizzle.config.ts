import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./auth-schema.ts", "./src/schema/*.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://postgres:postgres@localhost:5433/hirelens",
  },
  strict: true,
  verbose: true,
});
