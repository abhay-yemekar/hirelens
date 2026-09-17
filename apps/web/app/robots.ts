import type { MetadataRoute } from "next";

/**
 * Allow the marketing surface; keep crawlers out of the product app
 * (session-gated, no index value) and API. Sitemap points at the
 * configured origin so production emits its real absolute URL.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/jobs", "/welcome", "/signin"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
