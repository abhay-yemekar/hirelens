/**
 * Hero product mockups. Faithful recreations of the actual product UI
 * populated with REAL data from a live scoring run (9 synthetic
 * candidates scored by Gemini through the real pipeline, decisions and
 * demographics recorded, bias audit computed) — styled to sit on the
 * dark marketing canvas.
 */

const STAGE_STYLE: Record<string, { bg: string; fg: string }> = {
  advanced: { bg: "#e8f7ee", fg: "#147d43" },
  shortlisted: { bg: "#fff3e8", fg: "#b45309" },
  new: { bg: "#eef1f8", fg: "#5a6488" },
  rejected: { bg: "#fdecec", fg: "#b42318" },
};

const RANKED: Array<{ name: string; overall: number; stage: string }> = [
  { name: "Olivia Brown", overall: 43, stage: "shortlisted" },
  { name: "Ethan Patel", overall: 30, stage: "rejected" },
  { name: "Emily Chen", overall: 26, stage: "shortlisted" },
  { name: "David Okafor", overall: 21, stage: "advanced" },
  { name: "Priya Sharma", overall: 19, stage: "shortlisted" },
];

const CRITERIA: Array<{ title: string; score: number; quote: string; start: number; end: number }> =
  [
    {
      title: "Reliability & incident response",
      score: 5,
      quote: "Owned reliability for a payments API serving 200M requests/day",
      start: 214,
      end: 278,
    },
    {
      title: "Event-driven & queue architecture",
      score: 4,
      quote: "Built chaos experiments on Kafka and PostgreSQL failover paths",
      start: 340,
      end: 400,
    },
    {
      title: "Fintech / payments context",
      score: 4,
      quote: "Wrote SLOs and error budgets; drove MTTR down 60%",
      start: 285,
      end: 334,
    },
  ];

const AUDIT_ROWS: Array<{
  group: string;
  considered: number;
  selected: number;
  rate: string;
  ratio: string;
  flag: boolean;
}> = [
  { group: "Women", considered: 5, selected: 3, rate: "60%", ratio: "0.60", flag: true },
  { group: "Men", considered: 6, selected: 1, rate: "17%", ratio: "0.17", flag: true },
  { group: "Undisclosed", considered: 1, selected: 1, rate: "100%", ratio: "1.00", flag: false },
];

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
            9 candidates · scored by gemini-2.5-flash · rubric v1
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
                        width: `${(row.overall / 50) * 100}%`,
                        background:
                          row.overall >= 30 ? "#10b981" : row.overall > 0 ? "#f59e0b" : "#f87171",
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
      <p className="px-5 pb-3 pt-2 text-[10px]" style={{ color: "#7d86a8" }}>
        4 more candidates →
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
      <BrowserChrome title="hirelens · Olivia Brown — evidence" />
      <div className="p-4">
        <p
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "#7d86a8" }}
        >
          Resume
        </p>
        <p className="mt-2 text-[12px] leading-6" style={{ color: "#3c4568" }}>
          Olivia Brown — Site Reliability Engineer
          <br />
          FintechScale · 2020–present
          <br />
          <mark
            className="hl-evidence-mark rounded px-0.5"
            style={{
              background: "rgba(255,107,87,0.28)",
              boxShadow: "0 0 0 2px rgba(255,107,87,0.35)",
            }}
          >
            Owned reliability for a payments API serving 200M requests/day
          </mark>
          . Wrote SLOs and error budgets; drove MTTR down 60%. Built chaos experiments on Kafka and
          PostgreSQL failover paths.
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
                  title={`“${c.quote}”`}
                >
                  “{c.quote}”
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
          <span className="shrink-0 text-[11px] font-medium">Overall</span>
          <span className="shrink-0 whitespace-nowrap text-[15px] font-bold">43/100</span>
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
              Dimension: gender · four-fifths rule · 12 considered
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: "#fdecec", color: "#b42318" }}
          >
            FLAGGED
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
            {AUDIT_ROWS.map((row) => (
              <tr
                key={row.group}
                className="border-t"
                style={{ borderColor: "rgba(28,35,64,0.06)" }}
              >
                <td className="py-2.5 font-medium">{row.group}</td>
                <td className="py-2.5 text-right">{row.considered}</td>
                <td className="py-2.5 text-right">{row.selected}</td>
                <td className="py-2.5 text-right">{row.rate}</td>
                <td className="py-2.5 text-right">{row.ratio}</td>
                <td className="py-2.5 text-right">
                  {row.flag ? (
                    <span className="font-bold" style={{ color: "#b42318" }}>
                      flag
                    </span>
                  ) : (
                    <span style={{ color: "#147d43" }}>pass</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] leading-4" style={{ color: "#7d86a8" }}>
          Statistical screen for further inquiry — not proof of discrimination. Exported JSON is
          written to the hash-chained audit log.
        </p>
      </div>
    </div>
  );
}
