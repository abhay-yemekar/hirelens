import { Card, CardContent, CardHeader, CardTitle } from "@hirelens/ui";

/**
 * ATS format check (v1.4) — shows the deterministic parse simulation
 * stored at ingest: verdict, score, and the actionable findings list.
 * Warns the recruiter before a scoring run is spent on a mangled resume.
 */

interface AtsFormat {
  verdict: "pass" | "warn" | "fail";
  score: number;
  findings: Array<{ code: string; label: string; detail: string }>;
}

const VERDICT_STYLE: Record<AtsFormat["verdict"], { background: string; color: string }> = {
  pass: {
    background: "color-mix(in oklab, var(--color-success) 16%, transparent)",
    color: "var(--color-success)",
  },
  warn: {
    background: "color-mix(in oklab, var(--hl-warn) 16%, transparent)",
    color: "var(--hl-warn)",
  },
  fail: {
    background: "color-mix(in oklab, var(--color-danger) 16%, transparent)",
    color: "var(--color-danger)",
  },
};

export function AtsFormatCard({ atsFormat }: { atsFormat: AtsFormat }) {
  const style = VERDICT_STYLE[atsFormat.verdict];
  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
            ATS format check
          </CardTitle>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
            style={{ background: style.background, color: style.color }}
          >
            {atsFormat.verdict} · {atsFormat.score}/100
          </span>
        </div>
        <p className="text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
          Deterministic parse simulation on the extracted text — how cleanly other applicant
          tracking systems will read this resume.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {atsFormat.findings.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            No parse hazards detected — headings, contact info, and text layout all read cleanly.
          </p>
        ) : (
          atsFormat.findings.map((f) => (
            <div
              key={f.code}
              className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0"
              style={{ borderColor: "var(--hl-border)" }}
            >
              <span className="text-sm font-medium text-[var(--hl-cream)]">{f.label}</span>
              <span className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                {f.detail}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
