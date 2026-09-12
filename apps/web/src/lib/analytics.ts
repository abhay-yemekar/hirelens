"use client";

/**
 * Product analytics (PostHog). A strict no-op until
 * NEXT_PUBLIC_POSTHOG_KEY is set — self-hosted/dev installs run with
 * zero analytics. Autocapture is deliberately off: on a hiring product
 * we send explicit, meaningful product events only, never raw DOM data.
 */
import posthog from "posthog-js";

const KEY = process.env["NEXT_PUBLIC_POSTHOG_KEY"];

/** Initialize once from the app shell. Safe to call unconditionally. */
export function initPostHog(): void {
  if (!KEY) return;
  if (posthog.__loaded) return;
  posthog.init(KEY, {
    api_host: process.env["NEXT_PUBLIC_POSTHOG_HOST"] ?? "https://us.i.posthog.com",
    capture_pageview: false, // manual pageviews on route change
    autocapture: false, // privacy-first: explicit events only
    persistence: "localStorage+cookie",
  });
}

/** Fire a manual pageview for the current route. */
export function capturePageview(): void {
  if (!KEY) return;
  posthog.capture("$pageview");
}

/** Record an explicit product event. No-op when analytics is disabled. */
export function trackEvent(event: string, props?: Record<string, unknown>): void {
  if (!KEY) return;
  posthog.capture(event, props);
}
