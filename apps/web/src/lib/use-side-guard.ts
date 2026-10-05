"use client";

import { useEffect, useRef, useState } from "react";
import { userTrack, useSession } from "@/lib/auth-client";

type Side = "candidate" | "recruiter";

async function fetchFreshTrack(): Promise<Side | null> {
  try {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: Record<string, unknown> } | null;
    return userTrack(data?.user);
  } catch {
    return null;
  }
}

/**
 * Side guard — a hard client-side invariant: while on a recruiter page the
 * session track must be recruiter (and vice versa). Covers direct-URL entry
 * (a bookmarked /candidate while on the recruiter side), stale tabs, and
 * links shared across sides.
 *
 * Deliberately paranoid after production incidents:
 *  1. The useSession cache can be stale (the track may have changed in
 *     another tab or just before a hard navigation), so a mismatch is
 *     re-confirmed against a fresh /api/auth/get-session fetch.
 *  2. The redirect is a hard window.location.assign, never router.replace —
 *     soft routing leaves the wrong side's payloads in Next's router cache.
 *  3. On window focus the side is re-checked, so a tab left open while the
 *     side was switched elsewhere self-corrects instead of drifting.
 *
 * Returns `guarding` while the check is in flight so pages can hold render
 * (no flash of the wrong side's content).
 */
export function useSideGuard(side: Side): { guarding: boolean } {
  const { data: session, isPending } = useSession();
  const track = userTrack(session?.user);
  const [state, setState] = useState<"checking" | "ok">("checking");
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current || isPending) return;
    const seen = track;
    // Signed out, side matches, or track unset (legacy user): nothing to
    // enforce — the page itself decides what a signed-out visitor sees.
    if (!session || seen === null || seen === side) {
      doneRef.current = true;
      setState("ok");
      return;
    }
    // Session shows the other side: confirm against the server, then hard-
    // navigate to that side's home.
    let cancelled = false;
    void (async () => {
      let confirmed = seen;
      const fresh = await fetchFreshTrack();
      if (fresh) confirmed = fresh;
      if (cancelled) return;
      doneRef.current = true;
      if (confirmed === side) {
        // The client cache was stale; server side matches this page.
        setState("ok");
        return;
      }
      window.location.assign(confirmed === "candidate" ? "/candidate" : "/jobs");
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, session, side, track]);

  // Self-correct a stale tab: if the side was switched elsewhere (another
  // tab, another device), redirect on focus.
  useEffect(() => {
    if (state !== "ok") return;
    let cancelled = false;
    const onFocus = () => {
      void (async () => {
        const fresh = await fetchFreshTrack();
        if (!cancelled && fresh && fresh !== side) {
          window.location.assign(fresh === "candidate" ? "/candidate" : "/jobs");
        }
      })();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [state, side]);

  return { guarding: state === "checking" };
}
