import { describe, expect, it } from "vitest";
import { DEV_AUTH_SECRET, resolveAuthSecret } from "./auth-secret.js";

const STRONG = "k3r9Vt0q8ZsXw2Lb6Pm1Nc4Hy7Ja5Ue0Rf";

describe("resolveAuthSecret", () => {
  it("falls back to the dev secret outside production", () => {
    expect(resolveAuthSecret({})).toBe(DEV_AUTH_SECRET);
    expect(resolveAuthSecret({ NODE_ENV: "test" })).toBe(DEV_AUTH_SECRET);
    expect(resolveAuthSecret({ NODE_ENV: "development", BETTER_AUTH_SECRET: "short" })).toBe(
      "short",
    );
  });

  it("lets `next build` through, which runs as production but signs nothing", () => {
    expect(
      resolveAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).toBe(DEV_AUTH_SECRET);
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["the dev fallback", DEV_AUTH_SECRET],
    ["the .env.example placeholder", "replace-with-32+char-random-secret"],
    ["too short", "only-twenty-chars-xx"],
  ])("refuses a %s secret in production", (_label, secret) => {
    expect(() => resolveAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("accepts a strong secret in production", () => {
    expect(resolveAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: STRONG })).toBe(STRONG);
  });
});
