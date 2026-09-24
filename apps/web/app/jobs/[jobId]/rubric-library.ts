/**
 * The rubric library (v1.2) — curated, schema-valid rubric presets for
 * common roles. One click imports a preset as the job's newest rubric
 * version; recruiters then tune weights/criteria in the editor. Every
 * preset builds the full six-level anchored scale per criterion, so the
 * import always satisfies RubricSchema (5–8 weighted criteria).
 */

/** Reuse the editor's anchored-scale generator (0–5 with plain wording). */
export function defaultScale(title: string) {
  const t = title.trim().toLowerCase() || "this criterion";
  return [
    { label: "0 — None", description: `No evidence of ${t} in the resume.` },
    { label: "1 — Faint", description: `Barely mentions anything related to ${t}.` },
    {
      label: "2 — Some",
      description: `Some exposure to ${t}: coursework, brief use, or a single project.`,
    },
    { label: "3 — Solid", description: `Clear working experience with ${t}.` },
    {
      label: "4 — Strong",
      description: `Substantial, repeated experience; led work involving ${t}.`,
    },
    { label: "5 — Expert", description: `Deep expertise with measurable impact in ${t}.` },
  ];
}

export interface RubricPreset {
  key: string;
  title: string;
  blurb: string;
  /** Criterion titles with relative weights. */
  criteria: Array<{ title: string; weight: number }>;
  /** Bar-proxy exclusions the whole rubric enforces. */
  exclusions: string[];
}

export const RUBRIC_LIBRARY: RubricPreset[] = [
  {
    key: "backend-eng",
    title: "Backend Engineer",
    blurb: "Server-side depth: design, data, reliability, and clear written thinking.",
    criteria: [
      { title: "System design", weight: 3 },
      { title: "Databases & data modeling", weight: 2.5 },
      { title: "API & integration experience", weight: 2 },
      { title: "Testing & reliability", weight: 2 },
      { title: "Ownership & communication", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "frontend-eng",
    title: "Frontend Engineer",
    blurb: "Product-facing craft: UI engineering, performance, accessibility, UX sense.",
    criteria: [
      { title: "Modern JavaScript/TypeScript depth", weight: 3 },
      { title: "UI framework experience (React or similar)", weight: 2.5 },
      { title: "CSS & layout craftsmanship", weight: 2 },
      { title: "Accessibility & web performance", weight: 2 },
      { title: "Product sense & collaboration", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "data-engineer",
    title: "Data Engineer",
    blurb: "Pipelines, warehousing, and orchestration at production scale.",
    criteria: [
      { title: "SQL & data modeling", weight: 3 },
      { title: "Pipeline & orchestration tooling (Airflow, dbt, …)", weight: 2.5 },
      { title: "Cloud data platforms", weight: 2 },
      { title: "Streaming & batch processing", weight: 2 },
      { title: "Data quality & documentation", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "fullstack-eng",
    title: "Full-stack Engineer",
    blurb: "End-to-end shipping: frontend, backend, and the deploy in between.",
    criteria: [
      { title: "End-to-end product delivery", weight: 3 },
      { title: "Backend & API experience", weight: 2.5 },
      { title: "Frontend craft", weight: 2.5 },
      { title: "Database & data handling", weight: 2 },
      { title: "DevOps & deployment", weight: 1.5 },
      { title: "Communication & ownership", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "product-manager",
    title: "Product Manager",
    blurb: "Discovery to delivery: customer insight, prioritization, and execution.",
    criteria: [
      { title: "Product strategy & discovery", weight: 3 },
      { title: "Data-driven decision making", weight: 2.5 },
      { title: "Stakeholder & cross-team leadership", weight: 2.5 },
      { title: "Delivery & execution track record", weight: 2 },
      { title: "Domain understanding", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "designer",
    title: "Product Designer",
    blurb: "Interaction quality: craft, research grounding, and shipped outcomes.",
    criteria: [
      { title: "Visual & interaction craft", weight: 3 },
      { title: "User research & validation", weight: 2.5 },
      { title: "Design systems experience", weight: 2 },
      { title: "Collaboration with engineering", weight: 2 },
      { title: "Outcome & impact framing", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "data-analyst",
    title: "Data Analyst",
    blurb: "From raw data to decisions: SQL, statistics, and clear storytelling.",
    criteria: [
      { title: "SQL proficiency", weight: 3 },
      { title: "Analytics & statistics", weight: 2.5 },
      { title: "Dashboarding & visualization", weight: 2 },
      { title: "Business communication", weight: 2 },
      { title: "Experimentation & A/B testing", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
  {
    key: "devops-sre",
    title: "DevOps / SRE",
    blurb: "Keeping production healthy: infrastructure, CI/CD, and incident response.",
    criteria: [
      { title: "Infrastructure as code & cloud", weight: 3 },
      { title: "CI/CD & release engineering", weight: 2.5 },
      { title: "Monitoring, alerting & observability", weight: 2.5 },
      { title: "Incident response & on-call", weight: 2 },
      { title: "Security & compliance hygiene", weight: 1.5 },
    ],
    exclusions: ["school prestige", "dates of employment", "photo or personal details"],
  },
];

/** Assemble the full, schema-valid rubric JSON for a preset. */
export function presetToRubric(preset: RubricPreset) {
  return {
    version: 1,
    key: preset.key,
    title: preset.title,
    criteria: preset.criteria.map((c) => {
      const slug = c.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return {
        key: slug,
        title: c.title,
        weight: c.weight,
        scale: defaultScale(c.title),
        doNotUse: [],
      };
    }),
    exclusions: preset.exclusions,
  };
}
