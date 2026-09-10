const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DATE_RANGE_RE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?((?:19|20)\d{2})\s*(?:-|\u2013|\u2014|to|until)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*)?((?:19|20)\d{2}|present|current|now)/i;

export interface DateRange {
  start: string;
  end: string;
  current: boolean;
}

/**
 * Extract a date range from a line: "Mar 2021 - Present",
 * "2021 - 2023", "2019 to 2021". Returns null when absent.
 */
export function extractDateRange(line: string): DateRange | null {
  const m = DATE_RANGE_RE.exec(line);
  if (!m) return null;
  const monthStart = m[1];
  const startYear = m[2];
  const monthEnd = m[3];
  const endPart = m[4];
  if (!startYear || !endPart) return null;
  const start = `${monthStart ? normalizeMonth(monthStart) : ""}${startYear}`;
  const endRaw = endPart.toLowerCase();
  const current = endRaw === "present" || endRaw === "current" || endRaw === "now";
  const end = current ? "present" : `${monthEnd ? normalizeMonth(monthEnd) : ""}${endRaw}`;
  return { start, end, current };
}

function normalizeMonth(word: string): string {
  const w = word.trim().replace(/\.$/, "").toLowerCase();
  const hit = MONTHS.find((m) => w.startsWith(m.toLowerCase()));
  return hit ? `${hit} ` : "";
}
