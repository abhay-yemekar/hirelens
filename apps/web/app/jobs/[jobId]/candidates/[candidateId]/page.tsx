"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NoticeBanner } from "@/components/notice-banner";
import { getCandidate, type Stage } from "@/lib/api";
import { candidateLabel, cap } from "@/lib/format";

interface DecisionRow {
  stage: Stage;
  reason: string;
  decidedAt: string;
}

/** Candidate detail: resume text (optionally blind-masked) + decision history. */
export default function CandidatePage() {
  const params = useParams<{ jobId: string; candidateId: string }>();
  const search = useSearchParams();
  const blind = search.get("blind") === "1";

  const [rawText, setRawText] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        // `blind` is forwarded to the API, which masks server-side so the
        // unmasked text never reaches the browser.
        const res = await getCandidate(params.jobId, params.candidateId, { blind });
        setRawText(res.documents[0]?.rawText ?? "");
        setName(candidateLabel(res.candidate.id, res.candidate.sourceFileKey ?? null));
        setDecisions(res.decisions);
      } catch (err) {
        setError(err);
      }
    })();
  }, [params.jobId, params.candidateId, blind]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <Link
            href={`/jobs/${params.jobId}`}
            className="text-sm transition-colors hover:text-[var(--hl-cream)]"
            style={{ color: "var(--hl-mist)" }}
          >
            ← Job
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
            {blind ? "Candidate (blinded)" : (name ?? "Candidate")}
          </h1>
        </header>

        {error ? <NoticeBanner error={error} /> : null}

        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
              Extracted text {blind ? "— identity masked" : ""}
            </CardTitle>
            <p className="text-xs leading-5" style={{ color: "var(--color-fg-muted)" }}>
              The AI reads exactly this extracted text — your original file is never altered.
            </p>
          </CardHeader>
          <CardContent>
            {rawText === null ? (
              <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                Loading…
              </p>
            ) : (
              <pre
                className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl p-3 font-mono text-xs leading-5"
                style={{ background: "var(--hl-ink-2)", color: "var(--color-fg)" }}
                role="region"
                aria-label="Extracted resume text, scrollable"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG scrollable regions must be keyboard-focusable (axe-verified)
                tabIndex={0}
              >
                {rawText}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
              Decision history
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {decisions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                No decisions recorded yet.
              </p>
            ) : (
              decisions.map((d) => (
                <div
                  key={`${d.decidedAt}-${d.stage}`}
                  className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0"
                  style={{ borderColor: "var(--hl-border)" }}
                >
                  <span className="text-sm font-medium text-[var(--hl-cream)]">
                    {cap(d.stage)} · {new Date(d.decidedAt).toLocaleString()}
                  </span>
                  <span className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                    {d.reason}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
