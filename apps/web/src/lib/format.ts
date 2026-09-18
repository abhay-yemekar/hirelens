/**
 * Human-formatting helpers. Internal vocabulary (enum values, BCP-47 tags,
 * model IDs, storage keys) never reaches the UI raw — these translate it
 * once, so every page renders the same polished labels.
 */

/** "draft" → "Draft", "advanced" → "Advanced". */
export function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "en-US" → "English", "fr" → "French". Falls back to the raw tag. */
export function languageName(tag: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    return name && name !== tag ? name : tag;
  } catch {
    return tag;
  }
}

/** 2 → "2 pages", 1 → "1 page". */
export function pagesLabel(pages: number | null | undefined): string | null {
  if (pages === null || pages === undefined) return null;
  return `${pages} ${pages === 1 ? "page" : "pages"}`;
}

/** "gemini-2.5-flash" → "Gemini 2.5 Flash"; unknown shapes pass through. */
export function modelLabel(modelId: string): string {
  return modelId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

/**
 * Storage key → the filename the user uploaded ("resumes/abc/John_Doe.pdf"
 * → "John Doe"). Returns null when there is no key (e.g. zip entries
 * before persist) so callers can fall back to a candidate ID. The
 * extension is stripped and underscores/hyphens become spaces.
 */
export function fileLabel(sourceFileKey: string | null | undefined): string | null {
  if (!sourceFileKey) return null;
  const last = sourceFileKey.split("/").pop();
  if (!last) return null;
  const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
  const pretty = withoutExt.replace(/[_-]+/g, " ").trim();
  return pretty || last;
}

/**
 * A short human identifier for a candidate: the uploaded filename when we
 * have one, otherwise a compact id fragment. Blind review deliberately
 * does NOT use this — callers pass blind names themselves.
 */
export function candidateLabel(
  candidateId: string,
  sourceFileKey: string | null | undefined,
): string {
  return fileLabel(sourceFileKey) ?? `Candidate ${candidateId.slice(0, 8)}`;
}

/** Relative time for timestamps: "just now", "5m ago", "3h ago", "2d ago", else a date. */
export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
