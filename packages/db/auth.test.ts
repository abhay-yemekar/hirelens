import { describe, expect, it } from "vitest";
import { auth } from "./auth.config.js";

describe("better-auth config", () => {
  it("constructs with email/password and the organization plugin", () => {
    expect(auth).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });
});
