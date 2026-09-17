import type { MetadataRoute } from "next";
import { normalizeOrigin } from "../src/lib/site-url";

/**
 * Static marketing routes. Product routes (jobs, signin, welcome) are
 * intentionally excluded — they're either session-gated or noise for
 * crawlers. The origin follows NEXT_PUBLIC_SITE_URL so production
 * deploys emit absolute URLs for their real domain.
 */
const SITE_ROUTES = [
  "",
  "/demo",
  "/docs",
  "/evaluation",
  "/roadmap",
  "/contact",
  "/security",
  "/troubleshooting",
  "/api-reference",
  "/contributing",
  "/code-of-conduct",
  "/privacy",
  "/cookies",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = normalizeOrigin(process.env["NEXT_PUBLIC_SITE_URL"]);
  const now = new Date();
  return SITE_ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/demo" ? 0.8 : 0.6,
  }));
}
