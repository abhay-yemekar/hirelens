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
  <td><span class="score-badge">${score}</span></td>
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
  :root {
    --ink: #0d1226; --ink-2: #090d1c; --cream: #f7f3ea; --mist: #b6bdd4;
    --muted: #7d86a8; --accent: #ff6b57; --border: rgba(183, 191, 218, 0.16); --card: #121935;
  }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: var(--ink-2); color: var(--cream); line-height: 1.6; }
  .page { max-width: 56rem; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }

  .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.75rem; }
  .brand-mark { width: 2rem; height: 2rem; border-radius: 0.55rem; background: var(--accent); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.05rem; }
  .brand-name { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.01em; color: var(--cream); }
  .brand-tag { margin-left: auto; font-size: 0.8rem; color: var(--muted); }

  h1 { font-size: 1.6rem; margin: 0 0 0.35rem; color: var(--cream); letter-spacing: -0.01em; }
  h2 { font-size: 1.05rem; margin: 2.25rem 0 0.5rem; color: var(--accent); letter-spacing: 0.02em; }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.5rem; align-items: center; }
  .meta span { font-size: 0.8rem; color: var(--mist); }
  .overall-chip { display: inline-flex; align-items: baseline; gap: 0.35rem; background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 0.3rem 0.9rem; }
  .overall-chip strong { color: var(--accent); font-size: 1.05rem; }

  .howto { background: var(--card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.1rem 1.25rem; }
  .howto p { margin: 0; color: var(--mist); font-size: 0.92rem; }

  table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.88rem; }
  th, td { border: 1px solid var(--border); padding: 0.65rem 0.8rem; text-align: left; vertical-align: top; }
  th { background: var(--ink); color: var(--mist); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  tbody tr:nth-child(odd) td { background: rgba(18, 25, 53, 0.55); }
  td strong { color: var(--cream); }
  .score-badge { display: inline-block; font-weight: 700; color: var(--accent); white-space: nowrap; }
  ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
  li { margin-bottom: 0.3rem; }
  li::marker { color: var(--accent); }
  em { color: var(--muted); }
  .foot { margin-top: 2rem; font-size: 0.8rem; color: var(--muted); }
  .foot strong { color: var(--mist); }

  /* Paper output: white page, dark ink, brand accent retained. */
  @media print {
    body { background: #fff; color: #1a1a1a; }
    .page { max-width: none; padding: 0; }
    .brand-tag { color: #666; }
    h1 { color: var(--ink); }
    h2 { color: #c9452f; }
    .muted, .meta span { color: #666; }
    .overall-chip { background: #f6f2ea; border-color: #e2ddd2; }
    .overall-chip strong { color: #c9452f; }
    .howto { background: #f9f7f2; border-color: #e2ddd2; }
    .howto p { color: #444; }
    th { background: #f1efe9; color: #555; }
    tbody tr:nth-child(odd) td { background: #fafaf7; }
    td strong { color: #1a1a1a; }
    .score-badge { color: #c9452f; }
    li::marker { color: #c9452f; }
    em { color: #666; }
    th, td { border-color: #ddd; }
  }
</style>
</head>
<body>
<div class="page">
<div class="brand" aria-hidden="true">
  <span class="brand-mark">L</span>
  <span class="brand-name">HireLens</span>
  <span class="brand-tag">Evidence-linked screening</span>
</div>
<h1>Interview kit — ${escapeHtml(kit.candidateLabel)}</h1>
<div class="meta">
  <span>${escapeHtml(kit.rubricTitle)} · rubric v${kit.rubricVersion}</span>
  <span>${escapeHtml(kit.modelId)}</span>
  <span class="overall-chip">Overall <strong>${kit.overall === null ? "—" : Math.round(kit.overall)}</strong> / 100</span>
  <span>generated ${escapeHtml(kit.generatedAt.slice(0, 10))}</span>
</div>
<h2>How to use this</h2>
<div class="howto">
<p>
  Scores come from the resume alone. The probes below are derived from the same
  anchored scale the model scored against — use the interview to verify claims,
  not to re-litigate the score. The &ldquo;listen for&rdquo; quotes are what the model actually read.
</p>
</div>
<table>
  <thead>
    <tr><th>Criterion</th><th>Score</th><th>Anchor (awarded)</th><th>Probes &amp; listen-for</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<p class="foot">
  Generated by <strong>HireLens</strong> — evidence-linked screening. Probe notes should be recorded as a decision reason so they enter the audit trail.
</p>
</div>
</body>
</html>`;
}
