/** Terminal output helpers: aligned plain-text tables. */

/** Pad a cell to `width`, left-aligned or right-aligned (numbers). */
export function pad(cell: string, width: number, align: "left" | "right" = "left"): string {
  const visible = [...cell].length;
  const gap = Math.max(0, width - visible);
  return align === "left" ? `${cell}${" ".repeat(gap)}` : `${" ".repeat(gap)}${cell}`;
}

/** Render rows as a plain aligned table. First row = header. */
export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widthOf = (col: number): number => Math.max(...rows.map((r) => [...(r[col] ?? "")].length));
  const numeric = (col: number): boolean =>
    rows
      .slice(1)
      .every((r) => r[col] === undefined || r[col] === "" || /^\d+([.,]\d+)?$/.test(r[col] ?? ""));
  const header = rows[0];
  if (!header) return "";
  const widths = header.map((_, i) => widthOf(i));
  const out: string[] = [];
  for (const [i, row] of rows.entries()) {
    const line = row
      .map((cell, j) => pad(cell, widths[j] ?? 0, numeric(j) && i > 0 ? "right" : "left"))
      .join("  ");
    out.push(line.trimEnd());
    if (i === 0) out.push(widths.map((w) => "─".repeat(w)).join("  "));
  }
  return out.join("\n");
}
