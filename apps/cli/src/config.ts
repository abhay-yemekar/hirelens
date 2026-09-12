/**
 * CLI configuration: connection profile persisted to disk so commands
 * after `hirelens login` reuse the session cookie. Location is
 * overridable via HIRELENS_CONFIG_DIR (used by tests and CI).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CliConfig {
  /** Base URL of the HireLens API. */
  baseUrl: string;
  /** Better-Auth session cookie (the `better-auth.session_token=…` pair). */
  cookie?: string | undefined;
  /** Email of the signed-in user, display purposes only. */
  email?: string | undefined;
}

function configDir(): string {
  return (
    process.env["HIRELENS_CONFIG_DIR"] ?? join(process.env["HOME"] ?? process.cwd(), ".hirelens")
  );
}

function configFile(): string {
  return join(configDir(), "config.json");
}

export function defaultBaseUrl(): string {
  return process.env["HIRELENS_API_URL"] ?? "http://localhost:4000";
}

export function loadConfig(): CliConfig {
  // CI / one-shot usage: cookie straight from the environment wins.
  const envCookie = process.env["HIRELENS_COOKIE"];
  const envUrl = process.env["HIRELENS_API_URL"];
  const file: CliConfig = existsSync(configFile())
    ? (JSON.parse(readFileSync(configFile(), "utf8")) as CliConfig)
    : { baseUrl: defaultBaseUrl() };
  return {
    ...file,
    ...(envUrl ? { baseUrl: envUrl } : {}),
    ...(envCookie ? { cookie: envCookie } : {}),
  };
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function clearSession(): void {
  const config = loadConfig();
  saveConfig({ baseUrl: config.baseUrl });
}
