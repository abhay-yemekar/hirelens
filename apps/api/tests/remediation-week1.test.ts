/**
 * Unit tests (no DB) for the week-1 remediation changes:
 * migration-state comparison, per-provider failover breakdown, the LLM
 * availability guard semantics, and the shared blind-view masking.
 */
import { AllProvidersFailedError, blindView } from "@hirelens/core";
import { MIGRATION_SNAPSHOT } from "@hirelens/db";
import { describe, expect, it } from "vitest";
import { classifyAttempt, llmRouteError, sanitizeLlmConfigError } from "../src/llm-error.js";
// compareMigrations must see MIGRATION_SNAPSHOT — import both and assert on the
// journal snapshot that ships with @hirelens/db.
import { compareMigrations } from "../src/migration-health.js";

describe("compareMigrations", () => {
  it("reports healthy only when every journal migration is applied", () => {
    const applied = MIGRATION_SNAPSHOT.map((e) => e.when);
    const state = compareMigrations(applied);
    expect(state.missing).toEqual([]);
    expect(state.applied).toBe(MIGRATION_SNAPSHOT.length);
    expect(state.unknown).toBe(0);
  });

  it("detects behind-by-N for the exact prod incident (latest 2 missing)", () => {
    const applied = MIGRATION_SNAPSHOT.slice(0, -2).map((e) => e.when);
    const state = compareMigrations(applied);
    expect(state.missing).toHaveLength(2);
    expect(state.missing).toContain(MIGRATION_SNAPSHOT[MIGRATION_SNAPSHOT.length - 2]?.tag);
    expect(state.missing).toContain(MIGRATION_SNAPSHOT[MIGRATION_SNAPSHOT.length - 1]?.tag);
  });

  it("flags applied rows that match no journal entry as unknown", () => {
    const applied = [...MIGRATION_SNAPSHOT.map((e) => e.when), 999_999];
    const state = compareMigrations(applied);
    expect(state.missing).toEqual([]);
    expect(state.unknown).toBe(1);
    expect(state.applied).toBe(MIGRATION_SNAPSHOT.length);
  });

  it("detects a fully-migrated lookup on a zero-row table", () => {
    const state = compareMigrations([]);
    expect(state.missing).toHaveLength(MIGRATION_SNAPSHOT.length);
    expect(state.missing[0]).toBe(MIGRATION_SNAPSHOT[0]?.tag);
  });
});

describe("llmRouteError per-provider breakdown", () => {
  it("mixed chain failure stays transient and names each provider", () => {
    const err = new AllProvidersFailedError([
      { provider: "google", message: "429 Too Many Requests: resource exhausted" },
      {
        provider: "groq",
        message: "404: model gemini-2.5-flash does not exist",
      },
    ]);
    const mapped = llmRouteError("Scoring", err);
    expect(mapped.code).toBe("bad_response");
    expect(mapped.status).toBe(502);
    // The rate limit is NOT hidden by groq's misconfiguration...
    expect(mapped.message).toContain("google");
    expect(mapped.message).toContain("transient");
    expect(mapped.message).toContain("groq");
    // ...and groq's failure is attributed to configuration, not the rate limit.
    expect(mapped.message).toContain("configuration invalid");
  });

  it("all-misconfigured chain still maps to llm_misconfigured", () => {
    const err = new AllProvidersFailedError([
      { provider: "groq", message: "404: model foo does not exist" },
      { provider: "openrouter", message: "401 invalid_api_key" },
    ]);
    const mapped = llmRouteError("Derive", err);
    expect(mapped.code).toBe("llm_misconfigured");
    expect(mapped.status).toBe(503);
    expect(mapped.message).toContain("Per-provider");
  });
});

describe("attempt classification + sanitization", () => {
  it("classifies transient vs misconfigured vs generic failure", () => {
    expect(classifyAttempt("429 rate limit exceeded")).toBe("transient");
    expect(classifyAttempt("model gemini-2.5-flash does not exist")).toBe("misconfigured");
    expect(classifyAttempt("unexpected end of JSON")).toBe("failed");
  });

  it("sanitizes readLlmEnv config errors for UI surfacing", () => {
    expect(sanitizeLlmConfigError("  line1\nline2  ")).toBe("line1 line2");
    expect(sanitizeLlmConfigError("x".repeat(900))).toHaveLength(400);
  });
});

describe("blindView (re-exported from core, used by scoring)", () => {
  it("masks name and contact but preserves length and later lines", () => {
    const text =
      "JORDAN AVERY\nSenior Engineer - jordan@example.com\nEXPERIENCE\n- Led migration of the payments platform to Kubernetes";
    const masked = blindView(text);
    expect(masked).toHaveLength(text.length);
    // Whole first line masked, offsets intact.
    expect(masked.startsWith("■".repeat(12))).toBe(true);
    expect(masked.split("\n")[0]).toHaveLength("JORDAN AVERY".length);
    expect(masked).not.toContain("jordan@example.com");
    expect(masked).toContain("Led migration of the payments platform to Kubernetes");
  });
});
