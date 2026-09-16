import { ApiRequestError } from "./api";

/**
 * Human-facing error descriptor: every API failure maps to plain
 * language, an appropriate tone, and — where the user can act — a CTA.
 * Raw codes like `llm_not_configured` never reach the UI.
 */
export interface ErrorDescriptor {
  tone: "error" | "warning" | "info";
  text: string;
  cta?: { label: string; href: string };
}

export function describeError(err: unknown): ErrorDescriptor {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case "llm_not_configured":
        return {
          tone: "warning",
          text: "Scoring and rubric derivation need an LLM key. The rest of HireLens works without one — add HIRELENS_LLM_PROVIDER, HIRELENS_LLM_MODEL and HIRELENS_LLM_API_KEY to your .env, then restart the API.",
          cta: { label: "Self-hosting guide", href: "/docs/self-hosting" },
        };
      case "unauthorized":
        return {
          tone: "info",
          text: "Your session needs an active organization. Pick or create one to continue.",
          cta: { label: "Choose organization", href: "/welcome" },
        };
      case "forbidden":
        return {
          tone: "error",
          text: "You don't have access to this resource with your current organization membership.",
          cta: { label: "Switch organization", href: "/welcome" },
        };
      case "not_found":
        return {
          tone: "error",
          text: "That item doesn't exist (or belongs to another organization).",
          cta: { label: "Back to jobs", href: "/jobs" },
        };
      case "conflict":
        return {
          tone: "warning",
          text: "That already exists — try a different name or slug.",
        };
      case "bad_request":
      case "validation_error":
        return {
          tone: "error",
          text:
            err.message && err.message !== err.code
              ? err.message
              : "The request was invalid — check the inputs and try again.",
        };
      default:
        return {
          tone: "error",
          text:
            err.message && err.message !== err.code
              ? err.message
              : "Something went wrong talking to the API.",
          cta: { label: "Report an issue", href: "/contact" },
        };
    }
  }
  if (
    err instanceof Error &&
    (err.message.includes("fetch") || err.message.includes("Failed to fetch"))
  ) {
    return {
      tone: "error",
      text: "Can't reach the API. Is it running? (docker compose up -d, or pnpm dev for local development.)",
      cta: { label: "Troubleshooting", href: "/troubleshooting" },
    };
  }
  return {
    tone: "error",
    text: err instanceof Error ? err.message : "Something went wrong.",
    cta: { label: "Report an issue", href: "/contact" },
  };
}
