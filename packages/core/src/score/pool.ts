/**
 * Applicant-pool statistics. Percentile ranks a candidate's overall score
 * within the current applicant pool (plan §7: percentile next to the raw
 * 0-100 overall).
 */

/**
 * Percentile of `score` within `pool` (0-100). Higher is better:
 * the share of pool scores strictly below `score`, scaled so an
 * exact-top score ranks 100.
 */
export function percentileRank(pool: readonly number[], score: number): number {
  if (pool.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const s of pool) {
    if (s < score) below += 1;
    else if (s === score) equal += 1;
  }
  // Mid-rank convention for ties: (below + equal/2) / n.
  const rank = (below + equal / 2) / pool.length;
  return Math.round(rank * 100);
}

/** Arithmethic mean, rounded to one decimal; 0 for an empty pool. */
export function poolMean(pool: readonly number[]): number {
  if (pool.length === 0) return 0;
  const sum = pool.reduce((a, b) => a + b, 0);
  return Math.round((sum / pool.length) * 10) / 10;
}
