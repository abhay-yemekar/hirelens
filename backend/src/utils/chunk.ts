/**
 * Chunk text into ~400–600 token-ish pieces.
 * maxChars ~1800 is a safe default for local LLMs.
 */
export function chunkText(text: string, maxChars = 1800): string[] {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];

  const paras = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";

  for (const p of paras) {
    if ((buf + "\n\n" + p).length > maxChars) {
      if (buf) chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);

  // If any chunk is still too big, hard split
  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= maxChars) final.push(c);
    else {
      for (let i = 0; i < c.length; i += maxChars) {
        final.push(c.slice(i, i + maxChars));
      }
    }
  }

  return final;
}
