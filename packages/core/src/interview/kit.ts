/**
 * Interview kit generation (Wave 4).
 *
 * Given a rubric, a scoring run, and a candidate's scores, produces a
 * structured interview kit: per-criterion probe questions derived from the
 * anchored 0-5 scale, "what strong looks like" anchors, an evidence-based
 * listen-for list (the exact quotes the model scored), and probed follow-ups
 * for weak/high-variance criteria. Deterministic — no LLM call needed, so
 * kits are instant and reproducible.
 */

import type { Criterion } from "../rubric/schema.js";

export interface EvidenceSpan {
  startOffset: number;
  endOffset: number;
  quotedText: string;
}

export interface KitCriterion {
  key: string;
  title: string;
  weight: number;
  score: number | null;
  confidence: number | null;
  rationale: string | null;
  overridden: boolean;
  /** The evidence quotes behind the score (listen-for list). */
  evidence: string[];
  /** Interview probe questions, strongest first. */
  probes: string[];
  /** Verbatim anchor text for the awarded score and the next level up. */
  anchors: { awarded: string | null; nextLevel: string | null };
}

export interface InterviewKit {
  candidateLabel: string;
  overall: number | null;
  rubricVersion: number;
  rubricTitle: string;
  modelId: string;
  runId: string;
  generatedAt: string;
  criteria: KitCriterion[];
}

/** Map a 0–5 score to its anchored level description. */
function anchorFor(criterion: Criterion, score: number): string | null {
  const idx = Math.max(0, Math.min(5, Math.round(score)));
  return criterion.scale[idx]?.description ?? null;
}

const PROBE_TEMPLATE: Record<number, string> = {
  5: "They claim expert depth here — dig for the boundary: the hardest trade-off they made and what they'd do differently now.",
  4: "Strong claim: probe how they handled the messiest real instance, and what failed before it worked.",
  3: "Solid claim: test depth — a concrete scenario where they applied this, and the result they can quantify.",
  2: "Emerging claim: verify fundamentals — walk me through a basic real example end to end.",
  1: "Weak claim: confirm the minimum — is there any hands-on experience at all behind this?",
  0: "No evidence: if the resume is right, this area was untouched. Probe only if the candidate raises it.",
};

/**
 * Build the interview kit. Missing scores render as unprobed gaps with
 * suggested verification questions rather than a fabricated number.
 */
export function buildInterviewKit(input: {
  criteria: Criterion[];
  rubricVersion: number;
  rubricTitle: string;
  modelId: string;
  runId: string;
  candidateLabel: string;
  overall: number | null;
  scored: Array<{
    criterionKey: string;
    score: number | null;
    confidence: number | null;
    rationale: string | null;
    overriddenBy: string | null;
    evidence: EvidenceSpan[];
  }>;
}): InterviewKit {
  const byKey = new Map(input.scored.map((s) => [s.criterionKey, s] as const));

  const criteria: KitCriterion[] = input.criteria.map((c) => {
    const s = byKey.get(c.key);
    const score = s?.score ?? null;
    const confidence = s?.confidence ?? null;
    const rationale = s?.rationale ?? null;
    const overridden = s?.overriddenBy != null;

    const probes: string[] = [];
    if (score !== null) {
      const probe =
        PROBE_TEMPLATE[Math.round(score)] ?? PROBE_TEMPLATE[3] ?? PROBE_TEMPLATE[0] ?? "";
      probes.push(probe);
      // High-variance or low-confidence: ask for the strongest counter-evidence.
      if (confidence !== null && confidence < 0.5) {
        probes.push(
          "The model was unsure here — ask the candidate for their single strongest piece of evidence and verify it.",
        );
      }
      if (overridden) {
        probes.push(
          "A recruiter manually overrode this score before the interview — ask about anything the resume undersold.",
        );
      }
    } else {
      probes.push(
        "Not scored on this criterion — use the anchored scale to probe and score live during the debrief.",
      );
    }

    return {
      key: c.key,
      title: c.title,
      weight: c.weight,
      score,
      confidence,
      rationale,
      overridden,
      evidence: (s?.evidence ?? [])
        .map((e) => e.quotedText)
        .filter((q): q is string => typeof q === "string" && q.length > 0),
      probes,
      anchors: {
        awarded: score !== null ? anchorFor(c, score) : null,
        nextLevel:
          score !== null && score < 5 ? anchorFor(c, Math.min(5, Math.round(score) + 1)) : null,
      },
    };
  });

  return {
    candidateLabel: input.candidateLabel,
    overall: input.overall,
    rubricVersion: input.rubricVersion,
    rubricTitle: input.rubricTitle,
    modelId: input.modelId,
    runId: input.runId,
    generatedAt: new Date().toISOString(),
    criteria,
  };
}

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Render the kit as a standalone printable HTML document (print → PDF). */
export function renderKitHtml(kit: InterviewKit): string {
  const rows = kit.criteria
    .map((c) => {
      const evidence = c.evidence.length
        ? `<ul>${c.evidence.map((e) => `<li>&ldquo;${escapeHtml(e)}&rdquo;</li>`).join("")}</ul>`
        : "<p><em>No quoted evidence for this criterion.</em></p>";
      const probes = `<ul>${c.probes.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`;
      const score = c.score === null ? "—" : `${c.score} / 5${c.overridden ? " (overridden)" : ""}`;
      return `<tr>
  <td><strong>${escapeHtml(c.title)}</strong><br><span class="muted">weight ${c.weight}</span></td>
  <td>${score}</td>
  <td>${escapeHtml(c.anchors.awarded ?? "—")}</td>
  <td>${probes}${evidence}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Interview kit — ${escapeHtml(kit.candidateLabel)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 52rem; color: #1a1a1a; line-height: 1.5; padding: 0 1rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; }
  .muted { color: #666; font-size: 0.85rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: 0.6rem 0.75rem; text-align: left; vertical-align: top; font-size: 0.9rem; }
  th { background: #f6f6f6; }
  ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
  li { margin-bottom: 0.25rem; }
  .overall { font-size: 1.1rem; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Interview kit — ${escapeHtml(kit.candidateLabel)}</h1>
<p class="muted">
  ${escapeHtml(kit.rubricTitle)} · rubric v${kit.rubricVersion} · ${escapeHtml(kit.modelId)} ·
  overall ${kit.overall === null ? "—" : Math.round(kit.overall)} / 100 ·
  generated ${escapeHtml(kit.generatedAt)}
</p>
<h2>How to use this</h2>
<p>
  Scores come from the resume alone. The probes below are derived from the same
  anchored scale the model scored against — use the interview to verify claims,
  not to re-litigate the score. The &ldquo;listen for&rdquo; quotes are what the model actually read.
</p>
<table>
  <thead>
    <tr><th>Criterion</th><th>Score</th><th>Anchor (awarded)</th><th>Probes &amp; listen-for</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<p class="muted" style="margin-top:2rem">
  Generated by HireLens — evidence-linked screening. Probe notes should be recorded as a decision reason so they enter the audit trail.
</p>
</body>
</html>`;
}
