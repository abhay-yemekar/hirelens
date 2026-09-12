import type { NextConfig } from "next";

/**
 * `output: "standalone"` makes `next build` emit a minimal server bundle
 * (apps/web/.next/standalone) that the self-host Docker image runs —
 * no node_modules tree, no devDependencies, ~10× smaller runtime layer.
 */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
