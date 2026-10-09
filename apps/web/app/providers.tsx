"use client";

import { initTheme } from "@hirelens/ui";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { capturePageview, initPostHog } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";

/**
 * Routes that need the better-auth session cookie round-trip before first
 * paint. Everything else — the marketing site, docs, demo, legal pages —
 * renders its server content immediately so crawlers, link previews and
 * slow connections see the real page, not a spinner.
 */
const SESSION_GATED_PREFIXES = [
  "/jobs",
  "/talent-pool",
  "/analytics",
  "/settings",
  "/welcome",
  "/candidate",
  "/portal",
  "/track",
  "/report",
  "/share",
];

function needsSessionGate(pathname: string | null): boolean {
  if (!pathname) return false;
  return SESSION_GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Applies the stored theme before paint and hydrates the session state
 * once per app shell.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    initTheme();
    initPostHog();
    setReady(true);
  }, []);

  // Manual pageviews: Next may render a route before pathname updates,
  // so fire on the committed pathname only.
  useEffect(() => {
    if (ready) capturePageview();
  }, [ready, pathname]);

  // Only session-gated app routes wait for the auth round-trip; public
  // routes render children immediately (SSR content is already there).
  const { isPending } = authClient.useSession();
  const gated = needsSessionGate(pathname);
  if (!ready || (gated && isPending)) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-theme="dark">
        <span className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          Loading…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
