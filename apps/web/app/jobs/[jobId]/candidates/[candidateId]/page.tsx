"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getCandidate, type Stage } from "@/lib/api";

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
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        // `blind` is forwarded to the API, which masks server-side so the
        // unmasked text never reaches the browser.
        const res = await getCandidate(params.jobId, params.candidateId, { blind });
        setRawText(res.documents[0]?.rawText ?? "");
        setDecisions(res.decisions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load candidate");
      }
    })();
  }, [params.jobId, params.candidateId, blind]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header>
        <Link
          href={`/jobs/${params.jobId}`}
          className="text-sm"
          style={{ color: "var(--color-fg-muted)" }}
        >
          ← Job
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {blind ? "Candidate (blinded)" : `Candidate ${params.candidateId.slice(0, 8)}`}
        </h1>
      </header>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resume {blind ? "— identity masked" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {rawText === null ? (
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              Loading…
            </p>
          ) : (
            <pre
              className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs leading-5"
              style={{ color: "var(--color-fg)" }}
            >
              {rawText}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decision history</CardTitle>
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
                style={{ borderColor: "var(--color-border-subtle)" }}
              >
                <span className="text-sm font-medium">
                  {d.stage} · {new Date(d.decidedAt).toLocaleString()}
                </span>
                <span className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                  {d.reason}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
