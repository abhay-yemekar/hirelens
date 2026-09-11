/**
 * Adverse-impact metrics for a ranked shortlist (plan §3.1.2).
 *
 * The audit compares **selection rates** across self-reported demographic
 * groups against a chosen reference group. Three standard metrics:
 *
 *  - Selection rate per group (chosen / considered).
 *  - Four-fifths (80%) rule: a group's rate below 80% of the reference
 *    group's rate is flagged as potential adverse impact. The reference
 *    is the group with the **highest** selection rate (EEOC practice)
 *    unless overridden.
 *  - Demographic parity difference: reference rate minus group rate
 *    (0 means parity).
 *
 * These are screening statistics, not legal conclusions — the report UI
 * must carry that disclaimer (§12 risk note).
 */

export interface GroupOutcome {
  /** Group label, e.g. "woman", "man", "non-binary", "undisclosed". */
  group: string;
  /** Candidates considered (with a score) in this group. */
  considered: number;
  /** Candidates selected (e.g. shortlisted or advanced). */
  selected: number;
}

export interface GroupAuditRow {
  group: string;
  considered: number;
  selected: number;
  /** selected / considered, 0 when considered = 0. */
  selectionRate: number;
  /** selectionRate / referenceRate; null when the rate is undefined. */
  impactRatio: number | null;
  /** Four-fifths rule: impact ratio below 0.8 (and > 0 considered). */
  adverseImpact: boolean | null;
  /** Reference rate minus this group's rate. */
  parityDifference: number;
}

export interface BiasAudit {
  /** Group used as the four-fifths reference (highest selection rate). */
  referenceGroup: string;
  referenceRate: number;
  /** Overall selection rate across all groups. */
  overallRate: number;
  rows: GroupAuditRow[];
  /** True when every group with data passes the four-fifths rule. */
  allPass: boolean;
}

/** Selection rate = selected / considered; 0 for an empty group. */
export function selectionRate(g: GroupOutcome): number {
  return g.considered > 0 ? g.selected / g.considered : 0;
}

/**
 * Compute the audit. Groups with `considered = 0` are reported but never
 * flagged (no data ≠ adverse impact). The reference group defaults to the
 * highest-selection-rate group with at least one consideration, matching
 * common EEOC-style practice.
 */
export function biasAudit(outcomes: readonly GroupOutcome[]): BiasAudit {
  const rows = outcomes.map((g) => ({ ...g }));

  const withData = rows.filter((r) => r.considered > 0);
  const rates = new Map(rows.map((r) => [r.group, selectionRate(r)]));

  let referenceGroup = "";
  let referenceRate = 0;
  for (const r of withData) {
    const rate = rates.get(r.group) ?? 0;
    if (rate > referenceRate) {
      referenceRate = rate;
      referenceGroup = r.group;
    }
  }

  const totalConsidered = rows.reduce((a, r) => a + r.considered, 0);
  const totalSelected = rows.reduce((a, r) => a + r.selected, 0);
  const overallRate = totalConsidered > 0 ? totalSelected / totalConsidered : 0;

  const refRow = rows.find((r) => r.group === referenceGroup);

  const auditRows: GroupAuditRow[] = rows.map((r) => {
    const rate = rates.get(r.group) ?? 0;
    const isReference = r.group === referenceGroup;
    const impactRatio = r.considered === 0 || referenceRate === 0 ? null : rate / referenceRate;
    // Four-fifths via exact integer cross-multiplication:
    // selected/considered < 0.8 * refSelected/refConsidered
    //   ⟺ 5·selected·refConsidered < 4·considered·refSelected
    // (floats would flag exact-0.8 groups: 24/40 ÷ 30/40 → 0.79999…)
    const adverseImpact =
      r.considered === 0 || isReference || refRow === undefined || refRow.selected === 0
        ? null
        : 5 * r.selected * refRow.considered < 4 * r.considered * refRow.selected;
    return {
      group: r.group,
      considered: r.considered,
      selected: r.selected,
      selectionRate: rate,
      impactRatio,
      adverseImpact,
      parityDifference: isReference ? 0 : referenceRate - rate,
    };
  });

  return {
    referenceGroup,
    referenceRate,
    overallRate,
    rows: auditRows,
    allPass: auditRows.every((r) => r.adverseImpact !== true),
  };
}
