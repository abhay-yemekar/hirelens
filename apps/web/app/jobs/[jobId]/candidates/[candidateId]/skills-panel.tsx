"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { getCandidateSkills, type SkillGraphResult } from "@/lib/api";

/**
 * Skill-graph adjacency (v1.2) — deterministic, no LLM.
 * Matched = demonstrated. Adjacent = same family, "also strong at".
 * Missing = no signal in the resume. Titles explain the concept in plain
 * language so the panel never needs a glossary.
 */

type Section = "matched" | "adjacent" | "missing";

const SECTIONS: Array<{
  key: Section;
  title: string;
  hint: string;
  chipStyle: React.CSSProperties;
}> = [
  {
    key: "matched",
    title: "Matched",
    hint: "Skills the job targets that this resume demonstrates.",
    chipStyle: {
      borderColor: "rgba(74,222,128,0.45)",
      background: "rgba(74,222,128,0.08)",
      color: "rgb(134,239,172)",
    },
  },
  {
    key: "adjacent",
    title: "Also strong at (adjacent)",
    hint: "Skills from the same family the job cares about — not required, but real transferable strength.",
    chipStyle: {
      borderColor: "var(--hl-border)",
      background: "var(--hl-ink-2)",
      color: "var(--hl-cream)",
    },
  },
  {
    key: "missing",
    title: "Missing",
    hint: "Target skills with no signal in this resume. Worth probing in an interview.",
    chipStyle: {
      borderColor: "rgba(255,107,87,0.35)",
      background: "rgba(255,107,87,0.07)",
      color: "var(--hl-accent)",
    },
  },
];

export function SkillsPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const [graph, setGraph] = useState<SkillGraphResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const res = await getCandidateSkills(jobId, candidateId);
        if (!cancelled) setGraph(res);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, candidateId]);

  if (error) {
    return (
      <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
            Skill match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NoticeBanner error={error} />
        </CardContent>
      </Card>
    );
  }

  const empty = graph !== null && graph.target.length === 0;

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
          Skill match
        </CardTitle>
        <CardDescription style={{ color: "var(--color-fg-muted)" }}>
          Computed from the parsed resume against skills in the job description — deterministic, no
          AI judgment involved.{" "}
          {graph && graph.target.length > 0 ? `${graph.target.length} target skills found.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {graph === null ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Loading…
          </p>
        ) : empty ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            No recognizable skills in this job description yet — add technologies or tools to the
            job description to power this view.
          </p>
        ) : (
          SECTIONS.map((section) => {
            const items = graph?.[section.key] ?? [];
            if (items.length === 0) return null;
            const visible = expanded ? items : items.slice(0, 12);
            const hidden = items.length - visible.length;
            return (
              <div key={section.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium" style={{ color: "var(--hl-cream)" }}>
                    {section.title}
                  </p>
                  <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                    {items.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs" style={{ color: "var(--color-fg-muted)" }}>
                  {section.hint}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {visible.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md border px-2 py-0.5 text-xs font-medium"
                      style={section.chipStyle}
                    >
                      {skill}
                    </span>
                  ))}
                  {hidden > 0 ? (
                    <span className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
                      +{hidden} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        {graph !== null &&
        [graph.matched, graph.adjacent, graph.missing].some((a) => a.length > 12) ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            style={{ borderColor: "var(--hl-border)", color: "var(--hl-cream)" }}
          >
            {expanded ? "Show less" : "Show all skills"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
