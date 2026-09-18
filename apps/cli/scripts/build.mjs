/**
 * Bundle the HireLens CLI into a single dependency-free ESM file for npm.
 *
 * Why a bundle: the sources are TypeScript run via Node's native type
 * stripping (`node src/main.ts`) — great for the repo, but published .js
 * files must be real JavaScript (Node only strips types from .ts files).
 * esbuild strips the types once at pack time, so `npx hirelens` works on
 * any Node ≥ 20 with zero install-time compilation and zero runtime
 * dependencies.
 *
 * Run via `pnpm --filter @hirelens/cli build`. Output: dist/main.js
 * (+ LICENSE copied in for `npm pack`).
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(pkgRoot));
const dist = path.join(pkgRoot, "dist");

mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [path.join(pkgRoot, "src/main.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Note: no `banner` for the shebang — esbuild preserves the entry
  // point's own `#!/usr/bin/env node` line automatically (a banner
  // would duplicate it and break `node dist/main.js`).
  outfile: path.join(dist, "main.js"),
  sourcemap: false,
  logLevel: "info",
});

chmodSync(path.join(dist, "main.js"), 0o755);

// npm pack can't reach files outside the package directory — copy the
// repo LICENSE in so the published tarball carries it.
const licenseSrc = path.join(repoRoot, "LICENSE");
if (existsSync(licenseSrc)) copyFileSync(licenseSrc, path.join(pkgRoot, "LICENSE"));
