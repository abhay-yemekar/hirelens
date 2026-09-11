"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useState } from "react";
import { type BiasAuditReport, runBiasAudit } from "@/lib/api";

const DIMENSIONS = ["gender", "race_ethnicity", "age_band", "disability"];

/** Bias audit report: selection rates by group + four-fifths-rule verdict. */
export function BiasAuditCard({ jobId }: { jobId: string }) {
  const [dimension, setDimension] = useState(DIMENSIONS[0] ?? "gender");
  const [report, setReport] = useState<BiasAuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await runBiasAudit(jobId, { dimension });
      if ("audit" in res && res.audit) setReport(res as BiasAuditReport);
      else setError("No candidates on this job yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
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
    <Card>
      <CardHeader>
        <CardTitle>Bias audit</CardTitle>
        <CardDescription>
          Adverse-impact screening metrics (four-fifths rule) over self-reported demographics.
          Statistical signal, not a legal conclusion — HireLens helps you meet audit obligations; it
          does not make you compliant.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label
            className="text-sm"
            htmlFor="bias-dimension"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Dimension
          </label>
          <select
            id="bias-dimension"
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="rounded-[var(--radius-control)] border px-2 py-1 text-sm"
            style={{
              borderColor: "var(--color-border-subtle)",
              background: "var(--color-surface-raised)",
            }}
          >
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {d.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <Button onClick={run} disabled={busy} className="ml-auto">
            {busy ? "Auditing…" : "Generate report"}
          </Button>
          {report && (
            <Button variant="ghost" onClick={exportJson}>
              JSON
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

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
              style={{ borderColor: "var(--color-border-subtle)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: "var(--color-surface-sunken)",
                      color: "var(--color-fg-muted)",
                    }}
                  >
                    <th className="px-3 py-2 text-left font-medium">Group</th>
                    <th className="px-3 py-2 text-right font-medium">Considered</th>
                    <th className="px-3 py-2 text-right font-medium">Selected</th>
                    <th className="px-3 py-2 text-right font-medium">Rate</th>
                    <th className="px-3 py-2 text-right font-medium">Impact ratio</th>
                    <th className="px-3 py-2 text-left font-medium">4/5 rule</th>
                  </tr>
                </thead>
                <tbody>
                  {report.audit.rows.map((r) => (
                    <tr key={r.group} style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
