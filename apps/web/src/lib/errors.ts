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
          text: "Scoring and rubric derivation need an LLM key. Add HIRELENS_LLM_PROVIDER, HIRELENS_LLM_MODEL and HIRELENS_LLM_API_KEY to the root .env that Docker Compose reads, then run: docker compose up -d api. Everything else works without a key.",
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
      case "rate_limited":
        return {
          tone: "warning",
          text: "Too many requests in a short window — wait a minute and try again.",
        };
      case "bad_response":
      case "internal_error":
        return {
          tone: "error",
          text: "The API hit a temporary problem — this is usually transient. Try again; if it keeps happening, please report it.",
          cta: { label: "Report an issue", href: "/contact" },
        };
      case "file_too_large":
        return {
          tone: "warning",
          text: "That file is too large. Try a smaller file or compress it (e.g. print-to-PDF often shrinks scans).",
        };
      case "unsupported_media_type":
        return {
          tone: "warning",
          text: "That file type isn't supported. Upload a PDF, DOCX, TXT, or a zip of resumes.",
        };
      case "invalid_zip":
        return {
          tone: "error",
          text: "That zip couldn't be opened — it may be corrupt or password-protected. Try re-zipping the resumes.",
        };
      case "unreadable_document":
      case "low_information":
        return {
          tone: "warning",
          text: "The resume couldn't be read with enough detail to screen. Scanned images may need OCR, or try a text-based PDF.",
        };
      case "no_rubric":
        return {
          tone: "warning",
          text: "Add a rubric first — scoring needs criteria to grade against.",
          cta: { label: "Open the job", href: "/jobs" },
        };
      case "embedding_not_configured":
        return {
          tone: "warning",
          text: "Semantic search needs an embedding model key. Set the embedding provider env vars, or use keyword search for now.",
          cta: { label: "Self-hosting guide", href: "/docs/self-hosting" },
        };
      case "job_closed":
        return {
          tone: "warning",
          text: "That job is closed — reopen it to make changes.",
        };
      case "blind_review_active":
        return {
          tone: "info",
          text: "Blind review is on for this job, so identity details stay hidden until it's turned off.",
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
