/**
 * Environment settings were renamed from HIRELENS_* to CANDIDLENS_* with
 * the product rename (#114). Every reader goes through readSetting, so
 * deployments and .env files that still use the old names keep working.
 */

export const SETTING_PREFIX = "CANDIDLENS_";
export const LEGACY_SETTING_PREFIX = "HIRELENS_";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * A setting by its name without the prefix, e.g. "LLM_PROVIDER". The new
 * name wins; the old one is the fallback. An empty new value counts as
 * unset, because Docker Compose passes unset variables through as "".
 */
export function readSetting(name: string, env: Env = process.env): string | undefined {
  const current = env[SETTING_PREFIX + name];
  if (current !== undefined && current !== "") return current;
  return env[LEGACY_SETTING_PREFIX + name];
}
