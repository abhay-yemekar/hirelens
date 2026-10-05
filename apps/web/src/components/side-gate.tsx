"use client";

import { useSideGuard } from "@/lib/use-side-guard";

/**
 * Client gate for server layouts: renders children only once the session
 * side matches. On a mismatch the guard hard-navigates to the right side's
 * home and nothing renders here — no flash of the wrong side's page.
 */
export function SideGate({
  side,
  children,
}: {
  side: "candidate" | "recruiter";
  children: React.ReactNode;
}) {
  const { guarding } = useSideGuard(side);
  if (guarding) return null;
  return <>{children}</>;
}
