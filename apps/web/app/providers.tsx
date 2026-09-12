"use client";

import { initTheme } from "@hirelens/ui";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { capturePageview, initPostHog } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";

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

  // Wait for the better-auth session cookie round-trip so protected pages
  // render consistently on first paint.
  const { isPending } = authClient.useSession();
  if (!ready || isPending) {
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
