import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

const withFumaDocs = createMDX();

export default withFumaDocs(nextConfig);
