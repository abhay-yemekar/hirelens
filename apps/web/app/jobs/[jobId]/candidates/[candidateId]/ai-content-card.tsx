"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useEffect, useState } from "react";
import { type AiContentReport, getAiContent } from "@/lib/api";

/**
 * AI-content card (v1.2) — deterministic suspicion reading, no LLM.
 * Framing matters: the resume text is the candidate's own claim; this
 * card only suggests what to probe in the interview. It never asserts
 * the candidate cheated, and short resumes degrade honestly.
 */

const LEVEL_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "rgb(134,239,172)", bg: "rgba(74,222,128,0.10)" },
  moderate: { label: "Moderate", color: "var(--hl-cream)", bg: "rgba(148,163,184,0.12)" },
  notable: { label: "Notable", color: "var(--hl-accent)", bg: "rgba(255,107,87,0.10)" },
  insufficient_text: { label: "Not enough text", color: "var(--hl-mist)", bg: "transparent" },
};

export function AiContentCard({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const [report, setReport] = useState<AiContentReport | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAiContent(jobId, candidateId);
        if (!cancelled) setReport(res.aiContent);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, candidateId]);

  if (missing) return null; // no text stored — card silently absent

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
            Writing style reading
          </CardTitle>
          {report ? (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                color: LEVEL_STYLES[report.level]?.color,
                background: LEVEL_STYLES[report.level]?.bg,
                border: "1px solid var(--hl-border)",
              }}
            >
              {LEVEL_STYLES[report.level]?.label ?? report.level}
            </span>
          ) : null}
        </div>
        <CardDescription style={{ color: "var(--color-fg-muted)" }}>
          Deterministic pattern check for AI-typical phrasing — a prompt for interview questions,
          never a verdict. No AI judged this text.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report === null ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Loading…
          </p>
        ) : report.level === "insufficient_text" ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            {report.summary}
          </p>
        ) : (
          <>
            <p className="text-sm leading-6" style={{ color: "var(--hl-mist)" }}>
              {report.summary}
            </p>
            {report.signals.length > 0 ? (
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--hl-muted)" }}
                >
                  Example passages worth probing
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {report.signals.slice(0, 4).map((s, i) => (
                    <li
                      key={i}
                      className="rounded-lg border-l-2 px-3 py-2 font-mono text-xs leading-5"
                      style={{
                        borderColor: "var(--hl-border)",
                        background: "var(--hl-ink-2)",
                        color: "var(--hl-mist)",
                      }}
                    >
                      “{s.text}”
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
