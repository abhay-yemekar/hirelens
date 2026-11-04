/**
 * Outgoing email for the sign-in flows: password reset links and email
 * address confirmation links.
 *
 * - With CANDIDLENS_SMTP_USER and CANDIDLENS_SMTP_PASSWORD set, mail goes
 *   out over SMTP. The defaults fit a Gmail account with an app password
 *   (smtp.gmail.com, port 465, TLS); CANDIDLENS_SMTP_HOST,
 *   CANDIDLENS_SMTP_PORT and CANDIDLENS_MAIL_FROM change them for another
 *   provider.
 * - Without them, on a developer machine (not production, or an app
 *   address on localhost), each message is printed to the server log
 *   instead and kept in `loggedMail`, so local runs and tests can follow
 *   the links. A deployed site never logs a working link.
 * - Otherwise email is off: nothing is sent, and the web app hides the
 *   flows that need it.
 *
 * Messages carry no text the user typed (such as their name), so nobody
 * can use sign-up to send their own words from this address.
 */

import { createTransport } from "nodemailer";

type Env = Record<string, string | undefined>;

export type MailMode = "smtp" | "log" | "off";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** How long the links stay valid; the auth config sets the token lifetimes from these. */
export const RESET_LINK_HOURS = 1;
export const CONFIRM_LINK_HOURS = 24;

/** True when the app's own address (BETTER_AUTH_URL) is on this machine. */
function runsOnLocalhost(env: Env): boolean {
  try {
    const host = new URL(env["BETTER_AUTH_URL"] ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function mailMode(env: Env = process.env): MailMode {
  if (env["CANDIDLENS_SMTP_USER"] && env["CANDIDLENS_SMTP_PASSWORD"]) return "smtp";
  if (env["NODE_ENV"] !== "production" || runsOnLocalhost(env)) return "log";
  return "off";
}

/** SMTP settings; the defaults fit Gmail with an app password. */
export function smtpOptions(env: Env) {
  const port = Number(env["CANDIDLENS_SMTP_PORT"] || 465);
  return {
    host: env["CANDIDLENS_SMTP_HOST"] || "smtp.gmail.com",
    port,
    // 465 starts with TLS; any other port must upgrade to TLS before the
    // password is sent, or the send fails.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: env["CANDIDLENS_SMTP_USER"] ?? "",
      // Gmail shows app passwords in groups of four; the spaces are not part of it.
      pass: (env["CANDIDLENS_SMTP_PASSWORD"] ?? "").replace(/\s+/g, ""),
    },
    // Fail within seconds instead of holding a sign-in request for minutes.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

let transport: ReturnType<typeof createTransport> | null = null;

function smtpTransport(env: Env) {
  transport ??= createTransport(smtpOptions(env));
  return transport;
}

/** Messages printed in log mode, newest last; tests read the links from here. */
export const loggedMail: MailMessage[] = [];
const LOGGED_MAIL_LIMIT = 50;

export async function sendMail(message: MailMessage, env: Env = process.env): Promise<void> {
  const mode = mailMode(env);
  if (mode === "smtp") {
    const from = env["CANDIDLENS_MAIL_FROM"] || `"CandidLens" <${env["CANDIDLENS_SMTP_USER"]}>`;
    await smtpTransport(env).sendMail({ from, ...message });
    return;
  }
  if (mode === "log") {
    loggedMail.push(message);
    if (loggedMail.length > LOGGED_MAIL_LIMIT) loggedMail.shift();
    console.info(`[mail] to ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }
  console.warn(`[mail] not sent, email is not set up: ${message.subject}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A short message with one button-style link, as text and HTML. */
function linkMessage(opts: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): MailMessage {
  const greeting = "Hi,";
  const text = [
    greeting,
    "",
    opts.intro,
    "",
    `${opts.action}: ${opts.url}`,
    "",
    opts.outro,
    "",
    "CandidLens",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2033">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:15px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escapeHtml(opts.intro)}</p>
<p style="margin:0 0 20px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#ff6b57;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(opts.action)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5b6178">If the button doesn't work, paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(opts.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5b6178">${escapeHtml(opts.outro)}</p>
</div>
<p style="max-width:480px;margin:12px auto 0;font-size:12px;color:#8a90a6;text-align:center">CandidLens</p>
</body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}

export function passwordResetMessage(to: string, url: string): MailMessage {
  return linkMessage({
    to,
    subject: "Reset your CandidLens password",
    intro:
      "Someone asked to reset the password for your CandidLens account. If it was you, choose a new password with the link below.",
    action: "Choose a new password",
    url,
    outro: `The link works once and expires in ${RESET_LINK_HOURS} hour. If you didn't ask for this, ignore this email: your password stays the same.`,
  });
}

export function confirmEmailMessage(to: string, url: string): MailMessage {
  return linkMessage({
    to,
    subject: "Confirm your email for CandidLens",
    intro: "Confirm that this email address is yours to finish setting up your CandidLens account.",
    action: "Confirm my email",
    url,
    outro: `The link expires in ${CONFIRM_LINK_HOURS} hours. If you didn't create a CandidLens account, ignore this email.`,
  });
}
