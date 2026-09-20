"use client";

import { Card, CardContent, OverallScore, ScoreBadge } from "@hirelens/ui";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand";
import { fetchPublicReport, type PublicShareReport } from "@/lib/api";
import { cap, modelLabel } from "@/lib/format";

function criterionTitle(key: string): string {
  return key
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Public, read-only scored report behind a share token. No auth: the
 * token in the URL is the credential. Renders only the shareable
 * projection (labels, scores, rationales) — never contact details or
 * resume files.
 */
export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<PublicShareReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found" | "revoked" | "no_report">(
    "loading",
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchPublicReport(params.token);
        if (res.status === 410) {
          setStatus("revoked");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus(body.error === "no_report" ? "no_report" : "not_found");
          return;
        }
        const body = (await res.json()) as { report: PublicShareReport };
        setReport(body.report);
        setStatus("ok");
      } catch {
        setStatus("not_found");
      }
    })();
  }, [params.token]);

  const ranked = report ? [...report.candidates].sort((a, b) => b.overall - a.overall) : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-3">
        <LogoMark size={32} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-[var(--hl-cream)]">
            HireLens
          </span>
          <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
            Shared candidate evaluation
          </span>
        </div>
      </header>

      {status === "loading" && (
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          Loading report…
        </p>
      )}

      {status === "revoked" && (
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardContent className="flex flex-col gap-1 py-8 text-center">
            <p className="text-base font-medium text-[var(--hl-cream)]">
              This link has been revoked
            </p>
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              The organization that shared it turned the link off. Ask them for a new one.
            </p>
          </CardContent>
        </Card>
      )}

      {(status === "not_found" || status === "no_report") && (
        <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
          <CardContent className="flex flex-col gap-1 py-8 text-center">
            <p className="text-base font-medium text-[var(--hl-cream)]">
              {status === "no_report" ? "Nothing scored yet" : "Report not found"}
            </p>
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              {status === "no_report"
                ? "This link is active, but the organization hasn't completed a scoring run yet. Check back later."
                : "The link may be mistyped or was never valid."}
            </p>
          </CardContent>
        </Card>
      )}

      {status === "ok" && report && (
        <>
          <section className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
              {report.linkTitle || report.jobTitle}
            </h1>
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              {report.jobTitle !== (report.linkTitle || report.jobTitle)
                ? `${report.jobTitle} · `
                : ""}
              Scored with {modelLabel(report.modelId)} · rubric v{report.rubricVersion}
              {report.finishedAt ? ` · ${fmtDate(report.finishedAt)}` : ""}
            </p>
            <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              Read-only shared report — candidates are identified by their resume labels; personal
              contact details are never included.
            </p>
          </section>

          <div className="flex flex-col gap-4">
            {ranked.map((c, idx) => (
              <Card
                key={c.candidateId}
                style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
              >
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ background: "var(--hl-ink-2)", color: "var(--hl-mist)" }}
                        title={`Rank ${idx + 1}`}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-medium text-[var(--hl-cream)]">
                        {c.label ?? "Candidate"}
                      </span>
                    </div>
                    <OverallScore score={c.overall} label={`${c.label ?? "candidate"} overall`} />
                  </div>
                  <dl
                    className="flex flex-col gap-1.5 border-t pt-3"
                    style={{ borderColor: "var(--hl-border)" }}
                  >
                    {c.criteria.map((s) => (
                      <div
                        key={s.criterionKey}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <dt className="text-sm" style={{ color: "var(--hl-mist)" }}>
                          {criterionTitle(s.criterionKey)}
                        </dt>
                        <dd className="flex items-center gap-2">
                          <ScoreBadge score={s.score} label={s.criterionKey} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {c.criteria.some((s) => s.rationale) && (
                    <ul
                      className="flex flex-col gap-1.5 border-t pt-3"
                      style={{ borderColor: "var(--hl-border)" }}
                    >
                      {c.criteria
                        .filter((s) => s.rationale)
                        .map((s) => (
                          <li
                            key={s.criterionKey}
                            className="text-xs leading-5"
                            style={{ color: "var(--color-fg-muted)" }}
                          >
                            <span className="font-medium" style={{ color: "var(--hl-mist)" }}>
                              {criterionTitle(s.criterionKey)}:
                            </span>{" "}
                            {s.rationale}
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}
            {ranked.length === 0 && (
              <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
                No scored candidates in this report yet.
              </p>
            )}
          </div>

          <footer
            className="mt-4 border-t pt-4 text-xs"
            style={{ borderColor: "var(--hl-border)", color: "var(--color-fg-muted)" }}
          >
            Generated by{" "}
            <a
              href="https://github.com/abhay-yemekar/hirelens"
              className="underline underline-offset-4 hover:opacity-85"
              style={{ color: "var(--hl-accent)" }}
            >
              HireLens
            </a>{" "}
            — open-source, self-hostable AI resume screening. {cap("status")}: shared read-only.
          </footer>
        </>
      )}
    </main>
  );
}
