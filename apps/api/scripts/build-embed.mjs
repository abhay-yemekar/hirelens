/**
 * Bundle the HireLens API into a single ESM file that the Next.js app
 * imports from the catch-all Route Handler (apps/web/app/api/[[...route]]).
 *
 * Why a bundle: the workspace packages are TS-first with NodeNext
 * specifiers ("./foo.js" resolving to "./foo.ts"). Turbopack cannot
 * compile those sources via transpilePackages, but it bundles a plain
 * .mjs perfectly — the same prebundle approach Vercel's own Node
 * builders use. The .d.ts sibling re-exports the source types so the
 * web app keeps full typechecking against this entry.
 *
 * Run via `pnpm --filter @hirelens/api build:embed` (turbo wires it
 * before the web build in CI and on Vercel).
 *
 * External: everything the web app already resolves from its own
 * node_modules (Next runtime, server deps) — keeps the bundle small
 * and free of the Node built-ins polyfill problem.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = path.resolve(root, "../../web/.hirelens-api");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.resolve(root, "../src/vercel.ts")],
  outfile: path.join(outDir, "server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  // Vercel serverless runs production; defining this also strips the
  // pino-pretty dev transport (a runtime-resolved target the bundler
  // must not try to inline).
  define: { "process.env.NODE_ENV": '"production"' },
  // Node built-ins and server packages stay external: Next's bundler
  // cannot run CJS packages like pg (dynamic require of built-ins), so
  // they must resolve from the web app's node_modules at runtime —
  // every external below is declared in apps/web/package.json.
  // pino-pretty is dev-only (stripped via the NODE_ENV define).
  external: [
    "node:*",
    "pg",
    "pg-native",
    "drizzle-orm",
    "better-auth",
    "@better-auth/*",
    "hono",
    "pino",
    "pino-pretty",
    "@sentry/*",
    "langfuse",
    "@ai-sdk/*",
    "ai",
    "zod",
    "dotenv",
    "unpdf",
    "mammoth",
    "fflate",
  ],
  sourcemap: "external",
  logLevel: "info",
});

await writeFile(
  path.join(outDir, "server.d.ts"),
  'export { getServerApp, resetServerApp, flushSentry } from "../../api/src/vercel.js";\nexport type { HonoLikeApp } from "../../api/src/vercel.js";\n',
  "utf8",
);

console.log("API embed bundle written to apps/web/.hirelens-api/server.mjs");
