"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { type BiasAuditReport, runBiasAudit } from "@/lib/api";
import { cap } from "@/lib/format";

const DIMENSIONS = ["gender", "race_ethnicity", "age_band", "disability"];

const DIMENSION_HELP: Record<string, string> = {
  gender: "Compares selection rates across reported genders.",
  race_ethnicity: "Compares selection rates across reported race/ethnicity groups.",
  age_band: "Compares selection rates across reported age bands.",
  disability: "Compares selection rates for reported disability status.",
};

/** Bias audit report: selection rates by group + four-fifths-rule verdict. */
export function BiasAuditCard({ jobId }: { jobId: string }) {
  const [dimension, setDimension] = useState(DIMENSIONS[0] ?? "gender");
  const [report, setReport] = useState<BiasAuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await runBiasAudit(jobId, { dimension });
      if ("audit" in res && res.audit) setReport(res as BiasAuditReport);
      else setError("No candidates on this job yet.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hirelens-bias-audit-${jobId.slice(0, 8)}-${report.dimension}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Bias audit</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Checks whether any group of candidates advances at a notably lower rate than others — the
          standard "four-fifths" check used in hiring compliance. It's a statistical signal to
          investigate, not a legal conclusion.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="bias-dimension" style={{ color: "var(--hl-mist)" }}>
            Group candidates by
          </label>
          <select
            id="bias-dimension"
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="rounded-[var(--radius-control)] border px-2 py-1.5 text-sm text-[var(--hl-cream)]"
            style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
            aria-describedby="bias-dimension-help"
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {cap(d.replaceAll("_", " "))}
              </option>
            ))}
          </select>
          <span id="bias-dimension-help" className="text-xs" style={{ color: "var(--hl-muted)" }}>
            {DIMENSION_HELP[dimension]}
          </span>
          <Button onClick={run} disabled={busy} className="ml-auto">
            {busy ? "Auditing…" : "Generate report"}
          </Button>
          {report && (
            <Button variant="ghost" onClick={exportJson}>
              Export JSON
            </Button>
          )}
        </div>

        {error ? <NoticeBanner error={error} /> : null}

        {report && (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              {report.candidatesConsidered} considered · {report.withDemographics} self-reported ·{" "}
              {report.candidatesConsidered - report.withDemographics} undisclosed
            </p>
            <div
              className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium"
              style={{
                background: report.audit.allPass
                  ? "color-mix(in oklab, var(--color-success) 15%, transparent)"
                  : "color-mix(in oklab, var(--color-warning) 18%, transparent)",
                color: report.audit.allPass ? "var(--color-success)" : "var(--color-warning)",
              }}
            >
              {report.audit.allPass
                ? "Four-fifths rule: PASS — no group below 80% of the reference rate."
                : `Four-fifths rule: FLAG — see rows below 0.80 impact ratio (reference: ${report.audit.referenceGroup}).`}
            </div>
            <div
              className="overflow-hidden rounded-[var(--radius-card)] border"
              style={{ borderColor: "var(--hl-border)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: "var(--hl-ink-3)",
                      color: "var(--hl-mist)",
                    }}
                  >
                    <th className="px-3 py-2 text-left font-medium">Group</th>
                    <th className="px-3 py-2 text-right font-medium">Considered</th>
                    <th className="px-3 py-2 text-right font-medium">Selected</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th
                      className="px-3 py-2 text-right font-medium"
                      title="Group rate ÷ reference-group rate. Below 0.80 trips the four-fifths rule."
                    >
                      Impact ratio
                    </th>
                    <th className="px-3 py-2 text-left font-medium">4/5 rule</th>
                  </tr>
                </thead>
                <tbody>
                  {report.audit.rows.map((r) => (
                    <tr key={r.group} style={{ borderTop: "1px solid var(--hl-border)" }}>
                      <td className="px-3 py-2">{r.group}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.considered}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.selected}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {(r.selectionRate * 100).toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.impactRatio === null ? "—" : r.impactRatio.toFixed(2)}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{
                          color:
                            r.adverseImpact === true
                              ? "var(--color-danger)"
                              : r.adverseImpact === false
                                ? "var(--color-success)"
                                : "var(--color-fg-muted)",
                        }}
                      >
                        {r.adverseImpact === true
                          ? "FLAG"
                          : r.adverseImpact === false
                            ? "pass"
                            : "n/a"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-xs" style={{ color: "var(--hl-muted)" }}>
              <summary className="cursor-pointer select-none" style={{ color: "var(--hl-mist)" }}>
                How to read this report
              </summary>
              <p className="mt-2 leading-5">
                Each row is one group. "Considered" is how many candidates in the group were scored;
                "selected" is how many you advanced or shortlisted. The impact ratio divides the
                group's selection rate by the reference group's — below 0.80 trips the four-fifths
                rule and gets flagged for a closer look. Groups need a few candidates each before
                these numbers mean anything.
              </p>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
