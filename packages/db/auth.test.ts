import { describe, expect, it } from "vitest";
import { auth } from "./auth.config.js";

describe("better-auth config", () => {
  it("constructs with email/password and the organization plugin", () => {
    expect(auth).toBeDefined();
    expect(typeof auth.handler).toBe("function");
  });

  it("never lets Google or GitHub join an existing account on its own", () => {
    // Connecting happens only from Settings, signed in to the account.
    expect(auth.options.account?.accountLinking?.disableImplicitLinking).toBe(true);
  });

  it("does not sign anyone in from an email confirmation link", () => {
    expect(auth.options.emailVerification?.autoSignInAfterVerification).toBe(false);
  });

  it("signs the account out everywhere after a password reset", () => {
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });
});
