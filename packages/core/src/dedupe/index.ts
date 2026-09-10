import { createHash } from "node:crypto";

/** SHA-256 of the raw file bytes, hex-encoded. */
export function contentHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA-256 of extracted text, for near-duplicate detection across formats. */
export function textHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/** Jaro similarity in [0,1]; we use it for fuzzy name matching. */
export function jaro(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return a === b ? 1 : 0;
  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(i - matchWindow, 0);
    const hi = Math.min(i + matchWindow + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (!bFlags[j] && a[i] === b[j]) {
        aFlags[i] = true;
        bFlags[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  // Gmail-style dots and plus tags are aliases
  const stripped = domain.endsWith("gmail.com")
    ? local.replace(/\./g, "").replace(/\+.*$/, "")
    : local.replace(/\+.*$/, "");
  return `${stripped}@${domain}`;
}

export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similarity threshold above which two names are "the same person". */
export const NAME_SIMILARITY_THRESHOLD = 0.92;

export interface DuplicateMatch {
  index: number;
  /** true = identical content hash, false = fuzzy name/email match. */
  exact: boolean;
  reason: string;
}

/**
 * Find duplicates of `candidate` among previously ingested records.
 * Pure function - the caller decides whether to skip or merge.
 */
export function findDuplicates(
  candidate: {
    contentHashValue: string;
    textHashValue: string;
    name: string | null;
    email: string | null;
  },
  existing: Array<{
    contentHashValue: string;
    textHashValue: string;
    name: string | null;
    email: string | null;
  }>,
): DuplicateMatch[] {
  const dupes: DuplicateMatch[] = [];
  for (let i = 0; i < existing.length; i++) {
    const other = existing[i];
    if (!other) continue;
    if (other.contentHashValue === candidate.contentHashValue) {
      dupes.push({ index: i, exact: true, reason: "identical file bytes" });
      continue;
    }
    if (other.textHashValue === candidate.textHashValue) {
      dupes.push({ index: i, exact: true, reason: "identical extracted text" });
      continue;
    }
    const candEmail = normalizeEmail(candidate.email);
    const otherEmail = normalizeEmail(other.email);
    if (candEmail && otherEmail && candEmail === otherEmail) {
      dupes.push({ index: i, exact: false, reason: "same normalized email" });
      continue;
    }
    const candName = normalizeName(candidate.name);
    const otherName = normalizeName(other.name);
    if (candName && otherName && jaro(candName, otherName) >= NAME_SIMILARITY_THRESHOLD) {
      dupes.push({ index: i, exact: false, reason: "very similar name" });
    }
  }
  return dupes;
}
