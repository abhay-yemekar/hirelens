import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("migration 0000", () => {
  const dir = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const sql = readFileSync(`${dir}0000_keen_falcon.sql`, "utf8");

  it("creates all better-auth identity tables", () => {
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "organization",
      "member",
      "invitation",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("creates all domain tables", () => {
    for (const table of [
      "jobs",
      "rubrics",
      "candidates",
      "documents",
      "chunks",
      "scoring_runs",
      "scores",
      "evidence",
      "decisions",
      "audit_log",
      "demographics",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("uses the pgvector column type for embeddings", () => {
    expect(sql).toContain("vector(768)");
  });

  it("creates the HNSW index for cosine similarity", () => {
    expect(sql).toContain("hnsw");
  });
});
