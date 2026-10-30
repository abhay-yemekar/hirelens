export interface TextSpan {
  startOffset: number;
  endOffset: number;
  quotedText: string;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Fold typographic variants to ASCII for matching only. Models often quote
 * "on-call" with a non-breaking hyphen (U+2011) or swap straight and curly
 * quotes. Every replacement is one UTF-16 unit for one, so offsets into
 * the folded text are offsets into the original.
 */
function fold(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"');
}

/** Locate a quoted span in document text; whitespace- and dash-tolerant. */
export function locateEvidenceSpan(documentText: string, rawQuote: string): TextSpan | null {
  const quote = fold(rawQuote);
  const q = collapse(quote);
  if (q.length === 0) return null;

  const folded = fold(documentText);
  const exact = folded.indexOf(quote);
  if (exact !== -1) {
    return {
      startOffset: exact,
      endOffset: exact + quote.length,
      quotedText: documentText.slice(exact, exact + quote.length),
    };
  }

  // Fallback: match on whitespace-collapsed text, then map offsets back.
  const doc = collapse(folded);
  const hit = doc.indexOf(q);
  if (hit === -1) return null;

  // Prefix of the collapsed doc up to the hit tells us how much
  // original text it represents; measure by consuming source.
  const collapsedPrefix = doc.slice(0, hit);
  let consumed = 0;
  let srcIdx = 0;
  const src = documentText;
  while (srcIdx < src.length && consumed < collapsedPrefix.length) {
    const ch = src[srcIdx] ?? "";
    if (/\s/.test(ch)) {
      // Skip the whole whitespace run in the source.
      let j = srcIdx;
      while (j < src.length && /\s/.test(src[j] ?? "")) j += 1;
      // A whitespace run collapses to one space only if not at an edge.
      const atEdge = consumed === 0 || j >= src.length;
      if (!atEdge) consumed += 1;
      srcIdx = j;
    } else {
      consumed += 1;
      srcIdx += 1;
    }
  }
  // Skip leading whitespace before the span starts.
  while (srcIdx < src.length && /\s/.test(src[srcIdx] ?? "")) srcIdx += 1;

  const startOffset = srcIdx;
  let remaining = q.length;
  let endIdx = srcIdx;
  while (endIdx < src.length && remaining > 0) {
    const ch = src[endIdx] ?? "";
    if (/\s/.test(ch)) {
      let j = endIdx;
      while (j < src.length && /\s/.test(src[j] ?? "")) j += 1;
      const atEnd = j >= src.length;
      if (!atEnd) remaining -= 1;
      endIdx = j;
    } else {
      remaining -= 1;
      endIdx += 1;
    }
  }
  return {
    startOffset,
    endOffset: endIdx,
    quotedText: documentText.slice(startOffset, endIdx),
  };
}
