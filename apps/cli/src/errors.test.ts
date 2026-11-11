import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const MAIN = join(dirname(fileURLToPath(import.meta.url)), "main.ts");

describe("an error from a command", () => {
  const configDir = mkdtempSync(join(tmpdir(), "cli-config-"));
  afterAll(() => rmSync(configDir, { recursive: true, force: true }));

  it("prints one line and exits 1", () => {
    // Signed out (empty config dir, no cookie in the environment), so
    // `score` stops at the sign-in check before any request.
    const run = spawnSync(process.execPath, [MAIN, "score"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CANDIDLENS_CONFIG_DIR: configDir,
        CANDIDLENS_COOKIE: "",
        HIRELENS_COOKIE: "",
        NODE_NO_WARNINGS: "1",
      },
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr.trimEnd().split(/\r?\n/)).toEqual([
      "error: not signed in — run `hirelens login <email>` first (or set CANDIDLENS_COOKIE for CI).",
    ]);
  });
});
