/**
 * CLI configuration: connection profile persisted to disk so commands
 * after `hirelens login` reuse the session cookie. Location is
 * overridable via CANDIDLENS_CONFIG_DIR (used by tests and CI).
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

/**
 * A setting by its name without the prefix. Settings were renamed from
 * HIRELENS_* to CANDIDLENS_*; the old names still work. An empty new value
 * counts as unset. (Mirrors readSetting in core: the CLI has no runtime
 * dependencies.)
 */
export function setting(name: string): string | undefined {
  const current = process.env[`CANDIDLENS_${name}`];
  return current !== undefined && current !== "" ? current : process.env[`HIRELENS_${name}`];
}

function configDir(): string {
  return setting("CONFIG_DIR") ?? join(process.env["HOME"] ?? process.cwd(), ".hirelens");
}

function configFile(): string {
  return join(configDir(), "config.json");
}

export function defaultBaseUrl(): string {
  return setting("API_URL") ?? "http://localhost:4000";
}

export function loadConfig(): CliConfig {
  // CI / one-shot usage: cookie straight from the environment wins.
  const envCookie = setting("COOKIE");
  const envUrl = setting("API_URL");
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
