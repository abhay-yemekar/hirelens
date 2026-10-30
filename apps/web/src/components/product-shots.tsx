/**
 * Hero product mockups: faithful recreations of the product UI, styled to
 * sit on the dark marketing canvas. Every number is derived from a
 * recorded real-model run over the fictional demo resumes (see
 * src/lib/landing-sample.ts); stages and gender are synthetic decisions.
 */

import {
  excerptAround,
  groupLabel,
  SAMPLE_AUDIT,
  SAMPLE_CANDIDATES,
  SAMPLE_RUN,
  type SampleCandidate,
  topCriteria,
} from "@/lib/landing-sample";

const STAGE_STYLE: Record<string, { bg: string; fg: string }> = {
  advanced: { bg: "#e8f7ee", fg: "#147d43" },
  shortlisted: { bg: "#fff3e8", fg: "#b45309" },
  new: { bg: "#eef1f8", fg: "#5a6488" },
  rejected: { bg: "#fdecec", fg: "#b42318" },
};

const QUEUE_ROWS = 5;
const RANKED = SAMPLE_CANDIDATES.slice(0, QUEUE_ROWS);

/** The evidence card shows the top-ranked candidate, so it matches row 1. */
const FEATURED = SAMPLE_CANDIDATES[0] as SampleCandidate;
const CRITERIA = topCriteria(FEATURED, 3);
const HIGHLIGHT = CRITERIA[0]?.evidence
  ? excerptAround(FEATURED.text, CRITERIA[0].evidence)
  : { before: "", marked: "", after: "" };

const totalConsidered = SAMPLE_AUDIT.rows.reduce((n, r) => n + r.considered, 0);

/** No comparable group means nothing was tested, which is not a pass. */
const AUDIT_BADGE =
  SAMPLE_AUDIT.referenceGroup === ""
    ? { text: "NOT ENOUGH DATA", bg: "#eef1f8", fg: "#5a6488" }
    : SAMPLE_AUDIT.allPass
      ? { text: "PASS", bg: "#e8f7ee", fg: "#147d43" }
      : { text: "FLAGGED", bg: "#fdecec", fg: "#b42318" };

/** Four-fifths verdict for one row, worded like the product's audit view. */
function verdict(row: (typeof SAMPLE_AUDIT.rows)[number]): { text: string; color: string } {
  if (row.adverseImpact === true) return { text: "flag", color: "#b42318" };
  if (row.adverseImpact === false) return { text: "pass", color: "#147d43" };
  if (row.group === SAMPLE_AUDIT.referenceGroup) return { text: "ref", color: "#7d86a8" };
  return { text: "n/a", color: "#7d86a8" };
}

function BrowserChrome({ title }: { title: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-t-[14px] border-b px-4 py-2.5"
      style={{ borderColor: "rgba(28,35,64,0.08)", background: "rgba(28,35,64,0.03)" }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
      <span
        className="ml-3 rounded-md px-3 py-1 text-[11px] font-medium"
        style={{ background: "rgba(28,35,64,0.06)", color: "#5a6488" }}
      >
        {title}
      </span>
    </div>
  );
}

/** Ranked review queue — the product's job screen with live results. */
export function RankedQueueShot() {
  return (
    <div className="hl-shot overflow-hidden">
      <BrowserChrome title="hirelens · Senior Backend Engineer — Payments" />
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <p className="text-[13px] font-semibold">Review queue</p>
          <p className="text-[11px]" style={{ color: "#7d86a8" }}>
            {SAMPLE_CANDIDATES.length} candidates · scored by {SAMPLE_RUN.model} · rubric v
            {SAMPLE_RUN.rubricVersion}
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{ background: "#e8f7ee", color: "#147d43" }}
        >
          Run complete
        </span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ color: "#7d86a8", background: "rgba(28,35,64,0.02)" }}>
            <th className="px-5 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Candidate</th>
            <th className="px-2 py-2 text-left font-medium">Score</th>
            <th className="px-5 py-2 text-right font-medium">Stage</th>
          </tr>
        </thead>
        <tbody>
          {RANKED.map((row, i) => (
            <tr key={row.name} className="border-t" style={{ borderColor: "rgba(28,35,64,0.06)" }}>
              <td className="px-5 py-2.5" style={{ color: "#7d86a8" }}>
                {i + 1}
              </td>
              <td className="px-2 py-2.5 font-medium">{row.name}</td>
              <td className="px-2 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <span className="font-semibold">{row.overall}</span>
                  <span
                    className="h-1.5 w-16 overflow-hidden rounded-full"
                    style={{ background: "rgba(28,35,64,0.08)" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${row.overall}%`,
                        background:
                          row.overall >= 60 ? "#10b981" : row.overall > 0 ? "#f59e0b" : "#f87171",
                      }}
                    />
                  </span>
                </span>
              </td>
              <td className="px-5 py-2.5 text-right">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: STAGE_STYLE[row.stage]?.bg,
                    color: STAGE_STYLE[row.stage]?.fg,
                  }}
                >
                  {row.stage}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="flex justify-between gap-3 px-5 pb-3 pt-2 text-[10px]"
        style={{ color: "#7d86a8" }}
      >
        <span>Score from the model · stage set by the recruiter</span>
        <span className="shrink-0">{SAMPLE_CANDIDATES.length - RANKED.length} more →</span>
      </p>
    </div>
  );
}

/** Evidence viewer — resume text with the quoted span highlighted.
 *
 * Designed for the ~400px card it actually renders at (hero overlay and
 * feature bento): single column — resume on top, rubric breakdown below
 * with full-width rows. Criterion titles wrap across the whole row with
 * the score badge aligned to the top line (never floating mid-line
 * beside three wrapped lines), and the evidence mark pulses once on
 * load to reinforce the glass-box pitch. */
export function EvidenceShot() {
  return (
    <div className="hl-shot overflow-hidden">
      <BrowserChrome title={`hirelens · ${FEATURED.name} — evidence`} />
      <div className="p-4">
        <p
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "#7d86a8" }}
        >
          Resume
        </p>
        <p className="mt-2 text-[12px] leading-6" style={{ color: "#3c4568" }}>
          {FEATURED.name} — {FEATURED.role}
        </p>
        <p className="whitespace-pre-line text-[12px] leading-6" style={{ color: "#3c4568" }}>
          {HIGHLIGHT.before}
          <mark
            className="hl-evidence-mark rounded px-0.5"
            style={{
              background: "rgba(255,107,87,0.28)",
              boxShadow: "0 0 0 2px rgba(255,107,87,0.35)",
            }}
          >
            {HIGHLIGHT.marked}
          </mark>
          {HIGHLIGHT.after}
        </p>

        <p
          className="mt-4 border-t pt-3 text-[10px] font-semibold uppercase tracking-wider"
          style={{ borderColor: "rgba(28,35,64,0.06)", color: "#7d86a8" }}
        >
          Rubric breakdown
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {CRITERIA.map((c) => (
            <li
              key={c.title}
              className="flex items-start justify-between gap-2.5 rounded-lg border p-2.5"
              style={{ borderColor: "rgba(28,35,64,0.08)" }}
            >
              <span className="min-w-0 flex-1 text-[11px] font-medium leading-snug">
                {c.title}
                <span
                  className="mt-1 block truncate text-[10px] font-normal"
                  style={{ color: "#7d86a8" }}
                  title={`“${c.evidence?.quotedText}”`}
                >
                  “{c.evidence?.quotedText}”
                </span>
              </span>
              <span
                className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold leading-[1.4]"
                style={{ background: "#e8f7ee", color: "#147d43" }}
              >
                {c.score}/5
              </span>
            </li>
          ))}
        </ul>
        <div
          className="mt-3 flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
          style={{ background: "rgba(28,35,64,0.04)" }}
        >
          <span className="shrink-0 text-[11px] font-medium">
            Overall · all {FEATURED.criteria.length} criteria
          </span>
          <span className="shrink-0 whitespace-nowrap text-[15px] font-bold">
            {FEATURED.overall}/100
          </span>
        </div>
      </div>
    </div>
  );
}

/** Bias audit report — the flagship compliance screen. */
export function BiasAuditShot() {
  return (
    <div className="hl-shot overflow-hidden">
      <BrowserChrome title="hirelens · bias audit — gender" />
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold">Adverse-impact report</p>
            <p className="text-[11px]" style={{ color: "#7d86a8" }}>
              Dimension: gender · four-fifths rule · {totalConsidered} considered
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: AUDIT_BADGE.bg, color: AUDIT_BADGE.fg }}
          >
            {AUDIT_BADGE.text}
          </span>
        </div>
        <table className="mt-4 w-full text-[12px]">
          <thead>
            <tr style={{ color: "#7d86a8" }}>
              <th className="py-2 text-left font-medium">Group</th>
              <th className="py-2 text-right font-medium">Considered</th>
              <th className="py-2 text-right font-medium">Selected</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Ratio</th>
              <th className="py-2 text-right font-medium">4/5</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_AUDIT.rows.map((row) => {
              const v = verdict(row);
              return (
                <tr
                  key={row.group}
                  className="border-t"
                  style={{ borderColor: "rgba(28,35,64,0.06)" }}
                >
                  <td className="py-2.5 font-medium">{groupLabel(row.group)}</td>
                  <td className="py-2.5 text-right">{row.considered}</td>
                  <td className="py-2.5 text-right">{row.selected}</td>
                  <td className="py-2.5 text-right">{Math.round(row.selectionRate * 100)}%</td>
                  <td className="py-2.5 text-right">
                    {row.impactRatio === null ? "—" : row.impactRatio.toFixed(2)}
                  </td>
                  <td
                    className={`py-2.5 text-right${v.text === "flag" ? " font-bold" : ""}`}
                    style={{ color: v.color }}
                  >
                    {v.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] leading-4" style={{ color: "#7d86a8" }}>
          Synthetic decisions. Groups under 4 and Undisclosed are reported, not compared.
          Statistical screen for further inquiry — not proof of discrimination.
        </p>
      </div>
    </div>
  );
}
