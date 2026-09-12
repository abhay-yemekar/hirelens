/**
 * API client for the CLI. Better-Auth uses cookie sessions, so the CLI
 * signs in per invocation with credentials from the environment or the
 * saved profile, and forwards the session cookie on every call.
 */

import type { CliConfig } from "./config.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
}

/** Low-level request with the session cookie attached. */
async function request(
  config: CliConfig,
  path: string,
  opts: RequestOptions = {},
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { accept: "application/json" };
  let body: FormData | string | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (config.cookie) headers["cookie"] = config.cookie;
  // Better Auth validates the Origin header against its configured base
  // URL. Non-browser clients must present the deployment's web origin —
  // overridable with HIRELENS_ORIGIN for exotic setups.
  headers["origin"] = process.env["HIRELENS_ORIGIN"] ?? "http://localhost:3000";

  const init: RequestInit = { method: opts.method ?? "GET", headers };
  if (body !== undefined) init.body = body;
  const res = await fetch(`${config.baseUrl}${path}`, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function expectOk(status: number, json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as Record<string, unknown>;
  if (status >= 400 || body["ok"] === false) {
    const code = typeof body["error"] === "string" ? body["error"] : `http_${status}`;
    const message = typeof body["message"] === "string" ? body["message"] : code;
    throw new ApiError(status, code, message);
  }
  return body;
}

/**
 * Sign in with email/password and capture the session cookie from the
 * same response (single round-trip; a second sign-in would trip
 * better-auth's origin check and rate limits).
 */
export async function login(
  config: CliConfig,
  email: string,
  password: string,
): Promise<CliConfig> {
  const res = await fetch(`${config.baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: process.env["HIRELENS_ORIGIN"] ?? "http://localhost:3000",
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (res.status >= 400 || json["error"]) {
    const code = typeof json["error"] === "string" ? json["error"] : "sign_in_failed";
    const message =
      typeof json["message"] === "string" ? json["message"] : `Sign-in failed: ${code}`;
    throw new ApiError(res.status, code, message);
  }
  // undici exposes Set-Cookie only via getSetCookie() (the singular
  // getter is unreliable for multiple/forbidden headers).
  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith("better-auth.session_token="));
  if (!session) {
    throw new ApiError(
      res.status,
      "no_session",
      "Sign-in succeeded but no session cookie was returned",
    );
  }
  // Keep the cookie pair, drop attributes (Path/HttpOnly/SameSite…).
  return { ...config, cookie: session.split(";")[0] ?? "", email };
}

/** GET that returns the parsed body or a typed ApiError. */
export async function get(config: CliConfig, path: string): Promise<Record<string, unknown>> {
  const { status, json } = await request(config, path);
  return expectOk(status, json);
}

/** POST with a JSON body. */
export async function post(
  config: CliConfig,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const { status, json } = await request(config, path, { method: "POST", body });
  return expectOk(status, json);
}

/** POST multipart (resume upload). */
export async function upload(
  config: CliConfig,
  path: string,
  file: { name: string; mime: string; bytes: Uint8Array<ArrayBuffer> },
): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", new Blob([file.bytes]), file.name);
  const { status, json } = await request(config, path, { method: "POST", form });
  return expectOk(status, json);
}
