import { describe, expect, it, vi } from "vitest";
import {
  confirmEmailMessage,
  loggedMail,
  mailMode,
  passwordResetMessage,
  sendMail,
  smtpOptions,
} from "./mail.js";

describe("mailMode", () => {
  it("sends over SMTP when the user and password are set", () => {
    expect(
      mailMode({
        NODE_ENV: "production",
        CANDIDLENS_SMTP_USER: "a@example.com",
        CANDIDLENS_SMTP_PASSWORD: "x",
      }),
    ).toBe("smtp");
  });

  it("needs both the user and the password", () => {
    expect(mailMode({ NODE_ENV: "production", CANDIDLENS_SMTP_USER: "a@example.com" })).toBe("off");
  });

  it("logs instead of sending on a developer machine", () => {
    expect(mailMode({ NODE_ENV: "development" })).toBe("log");
    expect(mailMode({ NODE_ENV: "test" })).toBe("log");
    expect(mailMode({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3217" })).toBe(
      "log",
    );
  });

  it("never logs links for a deployed site", () => {
    expect(mailMode({ NODE_ENV: "production" })).toBe("off");
    expect(
      mailMode({ NODE_ENV: "production", BETTER_AUTH_URL: "https://candidlens.vercel.app" }),
    ).toBe("off");
  });
});

describe("smtpOptions", () => {
  it("defaults to Gmail over TLS on port 465", () => {
    const o = smtpOptions({ CANDIDLENS_SMTP_USER: "a@gmail.com", CANDIDLENS_SMTP_PASSWORD: "x" });
    expect(o).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true, requireTLS: false });
  });

  it("requires TLS before the password on any other port", () => {
    const o = smtpOptions({ CANDIDLENS_SMTP_PORT: "587" });
    expect(o).toMatchObject({ port: 587, secure: false, requireTLS: true });
  });

  it("drops the spaces Gmail shows in app passwords", () => {
    expect(smtpOptions({ CANDIDLENS_SMTP_PASSWORD: "abcd efgh ijkl mnop" }).auth.pass).toBe(
      "abcdefghijklmnop",
    );
  });
});

describe("sendMail", () => {
  it("keeps the message in log mode", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const message = passwordResetMessage("log@example.com", "https://x.test/r/1");
    await sendMail(message, { NODE_ENV: "test" });
    expect(loggedMail.at(-1)).toEqual(message);
    expect(info).toHaveBeenCalledOnce();
    info.mockRestore();
  });

  it("sends nothing when email is off", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = loggedMail.length;
    await sendMail(confirmEmailMessage("off@example.com", "https://x.test/v/1"), {
      NODE_ENV: "production",
    });
    expect(loggedMail.length).toBe(before);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("messages", () => {
  it("puts the link in both the text and the HTML", () => {
    const url = "https://candidlens.test/api/auth/reset-password/abc?callbackURL=x";
    const m = passwordResetMessage("a@example.com", url);
    expect(m.to).toBe("a@example.com");
    expect(m.subject).toBe("Reset your CandidLens password");
    expect(m.text).toContain(url);
    expect(m.html).toContain(url);
    expect(m.text).toContain("expires in 1 hour");
  });

  it("escapes the link in the HTML", () => {
    const m = confirmEmailMessage("a@example.com", 'https://x.test/v?a=1&b="2"<b>');
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain("https://x.test/v?a=1&amp;b=&quot;2&quot;&lt;b&gt;");
  });

  it("contains no text the user typed, only the fixed wording and the link", () => {
    const m = confirmEmailMessage("a@example.com", "https://x.test/v");
    expect(m.text.startsWith("Hi,\n")).toBe(true);
  });
});
