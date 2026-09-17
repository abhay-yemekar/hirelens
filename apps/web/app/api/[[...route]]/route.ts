import { flushSentry, getServerApp } from "@hirelens/api/embed";
import type { NextRequest } from "next/server";

/**
 * Same-origin mount of the Hono API inside the Next.js app.
 *
 * One Vercel project serves the marketing site, the product UI, and the
 * API — auth cookies stay first-party (never cross-site) and the browser
 * needs no separate API origin. The Docker/self-host path keeps using
 * apps/api's own Node server (main.ts); this handler exposes the
 * identical Hono app, whose routes already live under /api/*.
 *
 * The static Next.js route apps/web/app/api/demo/score/route.ts is more
 * specific than this catch-all, so the no-key live demo keeps working.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<Response> {
  const app = await getServerApp();
  try {
    return await app.fetch(request);
  } finally {
    void flushSentry();
  }
}

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
