/**
 * Keyword matching for search and Ask's keyword fallback.
 *
 * A term matches where it starts a word, so "postgres" finds "PostgreSQL"
 * and a half-typed "kuber" finds "Kubernetes", but "data" no longer
 * matches inside "update" and "up" no longer matches inside "upload".
 * Grammar words and words every resume has (section headings like
 * "experience") are not search terms. Each term counts for more the fewer
 * resumes in the job contain it, and a resume must score at least a third
 * of the best one, so a match on a common word alone ("design",
 * "developer") doesn't list most of the job. The rule was chosen on the
 * 12 demo resumes with labelled queries, then checked on held-out ones.
 */

/** Words a keyword search ignores. */
const STOP_WORDS = new Set(
  [
    // Grammar words.
    "a an the and or but nor of in on at to for with without by from as",
    "is are was were be been being has have had having do does did",
    "who whom whose what which where when how why that this these those",
    "it its they them their he she him his her we us our you your i me my",
    "can could would should will may might must about into onto over under",
    "up down out off than then so not no any some all more most very just",
    "also there here such other each both either via per etc",
    // Request words: what people type around the skill they want.
    "find show list give someone anyone somebody anybody people person",
    "candidate candidates resume resumes cv know knows knowledge",
    "strong good great background experienced",
    // Words in every resume: section headings and their usual company.
    "experience experiences year years skill skills education summary profile",
  ]
    .join(" ")
    .split(" "),
);

/** Most terms a query contributes; the rest of a long query is ignored. */
const MAX_TERMS = 8;

/**
 * Share of the best keyword score a resume needs to be a match. A third
 * keeps a resume with one of two rare terms ("prometheus grafana") and
 * drops one that only shares a word most resumes have.
 */
export const KEYWORD_MATCH_SHARE = 1 / 3;

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[a-z0-9]/.test(ch);

/**
 * The query's search terms: lower-cased words of two or more characters
 * (keeping `+`, `#` and inner dots, for "c++", "c#", "node.js"), without
 * stop words or repeats.
 */
export function keywordTerms(query: string): string[] {
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    let term = raw;
    while (term.startsWith(".")) term = term.slice(1);
    while (term.endsWith(".")) term = term.slice(0, -1);
    if (term.length < 2 || STOP_WORDS.has(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/** Where `word` next appears in `text` as a whole word, from `from`, or -1. */
function findWholeWord(text: string, word: string, from: number): number {
  for (let i = text.indexOf(word, from); i !== -1; i = text.indexOf(word, i + 1)) {
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + word.length])) return i;
  }
  return -1;
}

/**
 * Where `term` next matches in lower-cased `text` at or after `from`, or
 * -1. A match starts a word; a two-letter term must be the whole word
 * (or its plural), so "go" doesn't match "good". A plural term also
 * matches its singular as a whole word ("payments" finds "payment").
 */
export function findKeyword(text: string, term: string, from = 0): number {
  let found = -1;
  for (let i = text.indexOf(term, from); i !== -1; i = text.indexOf(term, i + 1)) {
    if (isWordChar(text[i - 1])) continue;
    const end = i + term.length;
    const tail = text[end] === "s" ? end + 1 : end;
    if (term.length > 2 || !isWordChar(text[tail])) {
      found = i;
      break;
    }
  }
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) {
    const singular = findWholeWord(text, term.slice(0, -1), from);
    if (singular !== -1 && (found === -1 || singular < found)) found = singular;
  }
  return found;
}

/** How many times `term` matches in lower-cased `text`. */
export function countKeyword(text: string, term: string): number {
  let count = 0;
  for (let i = findKeyword(text, term); i !== -1; i = findKeyword(text, term, i + 1)) count++;
  return count;
}

export interface KeywordMatch<T> {
  doc: T;
  score: number;
  /** Where the first matching term starts in the document's text. */
  firstIndex: number;
}

/**
 * The documents that match a keyword query, best first. A term found in
 * fewer documents weighs more (ln(1 + documents / documents with it)),
 * repeats add a little (1 + log2 count), and a document scoring under
 * KEYWORD_MATCH_SHARE of the best is dropped.
 */
export function rankByKeywords<T>(
  docs: T[],
  query: string,
  textOf: (doc: T) => string,
): Array<KeywordMatch<T>> {
  const terms = keywordTerms(query);
  if (terms.length === 0 || docs.length === 0) return [];
  const texts = docs.map((d) => textOf(d).toLowerCase());
  const counts = texts.map((text) => terms.map((t) => countKeyword(text, t)));
  const weights = terms.map((_, j) => {
    const withTerm = counts.filter((c) => (c[j] ?? 0) > 0).length;
    return withTerm === 0 ? 0 : Math.log(1 + docs.length / withTerm);
  });
  const matches: Array<KeywordMatch<T>> = [];
  docs.forEach((doc, i) => {
    let score = 0;
    let firstIndex = -1;
    terms.forEach((term, j) => {
      const count = counts[i]?.[j] ?? 0;
      if (count === 0) return;
      score += (weights[j] ?? 0) * (1 + Math.log2(count));
      const at = findKeyword(texts[i] ?? "", term);
      if (firstIndex === -1 || at < firstIndex) firstIndex = at;
    });
    if (score > 0) matches.push({ doc, score, firstIndex });
  });
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0]?.score ?? 0;
  return matches.filter((m) => m.score >= KEYWORD_MATCH_SHARE * best);
}
