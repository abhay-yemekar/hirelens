/**
 * Backfill candidate contact columns from stored document text.
 *
 * Older candidates were ingested before the parser's phone fix
 * (year ranges like "2019-2024" were being stored as phone numbers)
 * and before contact columns existed at all. This re-parses the raw
 * text that is already in the database — no original files needed —
 * and refreshes contactEmail / contactPhone where they are missing
 * or look like a date range.
 *
 * Usage:
 *   DATABASE_URL=postgres://… npx tsx scripts/backfill-contacts.ts [--dry-run]
 */

import { parseCandidate } from "@hirelens/core";
import { candidates, createDb, documents } from "@hirelens/db";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const db = createDb(DATABASE_URL);

  const rows = await db
    .select({
      id: candidates.id,
      email: candidates.contactEmail,
      phone: candidates.contactPhone,
      rawText: documents.rawText,
    })
    .from(candidates)
    .innerJoin(documents, eq(documents.candidateId, candidates.id));

  let fixed = 0;
  for (const row of rows) {
    const looksLikeYearRange = (p: string | null) =>
      /^(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}$/.test(p ?? "");
    if (row.email && row.phone && !looksLikeYearRange(row.phone)) continue;

    const parsed = parseCandidate(row.rawText);
    const email = row.email ?? parsed.email ?? null;
    const phone = looksLikeYearRange(row.phone)
      ? (parsed.phone ?? null)
      : (row.phone ?? parsed.phone ?? null);
    if (email === row.email && phone === row.phone) continue;

    console.log(
      `${row.id.slice(0, 8)}  phone: ${row.phone} -> ${phone}${email !== row.email ? `  email: ${row.email} -> ${email}` : ""}`,
    );
    if (!dryRun) {
      await db
        .update(candidates)
        .set({ contactEmail: email, contactPhone: phone })
        .where(eq(candidates.id, row.id));
    }
    fixed += 1;
  }

  console.log(
    `\nscanned ${rows.length} candidates, ${fixed} updated${dryRun ? " (dry run — nothing written)" : ""}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
