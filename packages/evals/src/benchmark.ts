/**
 * Seeded synthetic benchmark set (plan §3.1.5).
 *
 * Deterministic, self-contained resumes with expected outcomes, designed
 * so every metric is meaningful without any network access:
 *
 *  - `accuracy` cases have an expected criterion-level direction (strong /
 *    weak) that a correct scorer should respect;
 *  - `selfConsistency` re-scores the same resume repeatedly;
 *  - `positionBias` scores the same resumes in different orders;
 *  - `nameSwapBias` changes ONLY the name and expects the scores to hold.
 *
 * The content is synthetic (no real people, no real PII) and the seed
 * pins any stochastic elements.
 */

import type { AnchoredLevel, Criterion, Rubric } from "@hirelens/core";

export const BENCHMARK_SEED = 42;

const level = (n: number): AnchoredLevel => ({
  label: String(n),
  description: n === 0 ? "none" : n === 5 ? "expert" : `level ${n}`,
});

const LEVELS: [
  AnchoredLevel,
  AnchoredLevel,
  AnchoredLevel,
  AnchoredLevel,
  AnchoredLevel,
  AnchoredLevel,
] = [level(0), level(1), level(2), level(3), level(4), level(5)];

function criterion(key: string, title: string, weight: number): Criterion {
  return { key, title, weight, scale: LEVELS, doNotUse: [] };
}

/** The benchmark rubric — backend-engineering screen. */
export function benchmarkRubric(): Rubric {
  return {
    version: 1,
    key: "eval-backend-eng",
    title: "Backend Engineer (benchmark)",
    criteria: [
      criterion("system-design", "System design", 2),
      criterion("databases", "Databases", 1),
      criterion("testing", "Testing", 1),
      criterion("ops", "Operations / infra", 1),
      criterion("communication", "Communication", 1),
    ],
    exclusions: [],
  };
}

export type Strength = "strong" | "weak";

export interface BenchmarkResume {
  id: string;
  name: string;
  text: string;
  /** Expected direction per criterion — the accuracy ground truth. */
  expected: Partial<Record<string, Strength>>;
  /** Expected overall ordering bucket (1 = strongest). */
  expectedRank: number;
}

const section = (title: string, bullets: string[]): string =>
  [title, ...bullets.map((b) => `- ${b}`)].join("\n");

const STRONG_DESIGN = section("EXPERIENCE", [
  "Designed and led a multi-region event-driven platform handling 40k req/s on Kubernetes.",
  "Drove the migration from a monolith to bounded-context services, cutting p99 latency 60%.",
  "Made the build-vs-buy call on the streaming layer and wrote the adopted RFC.",
]);
const WEAK_DESIGN = section("EXPERIENCE", [
  "Worked on a team building web features from ticket specs.",
  "Occasionally joined architecture discussions as a note-taker.",
]);

const STRONG_DB = section("DATABASES", [
  "Owned PostgreSQL performance: cut the slowest report from 40 minutes to 90 seconds with index and query redesign.",
  "Designed the partitioning and retention strategy for a 2TB event store.",
]);
const WEAK_DB = section("DATABASES", [
  "Used the ORM for basic CRUD; DBAs handled anything beyond that.",
]);

const STRONG_TESTING = section("TESTING", [
  "Introduced contract testing across 12 services; flaky CI went from daily to zero in a quarter.",
  "Champions TDD; maintains the team's testing playbook and reviews every test-only PR.",
]);
const WEAK_TESTING = section("TESTING", [
  "Ran the tests when CI failed; coverage is the QA team's job.",
]);

const STRONG_OPS = section("OPERATIONS", [
  "Ran production on-call for a 30-service platform; built the incident playbook and cut MTTR 45%.",
  "Migrated deploys to GitOps with progressive rollouts and automatic rollback.",
]);
const WEAK_OPS = section("OPERATIONS", [
  "Deployed to staging when asked; a separate ops team owned production.",
]);

const STRONG_COMMS = section("COMMUNICATION", [
  "Wrote the engineering blog series adopted as onboarding material company-wide.",
  "Led cross-team design reviews and mentored four engineers to promotion.",
]);
const WEAK_COMMS = section("COMMUNICATION", ["Attend standups; most writing is ticket comments."]);

function resume(name: string, headline: string, blocks: string[]): string {
  return [name.toUpperCase(), headline, "", ...blocks].join("\n\n");
}

/** The benchmark set: 6 resumes spanning strong→weak, rank 1 = strongest. */
export function benchmarkResumes(): BenchmarkResume[] {
  return [
    {
      id: "eval-strong-all",
      name: "JordanMetric One",
      text: resume("JordanMetric One", "Staff Backend Engineer", [
        STRONG_DESIGN,
        STRONG_DB,
        STRONG_TESTING,
        STRONG_OPS,
        STRONG_COMMS,
      ]),
      expected: {
        "system-design": "strong",
        databases: "strong",
        testing: "strong",
        ops: "strong",
        communication: "strong",
      },
      expectedRank: 1,
    },
    {
      id: "eval-strong-mostly",
      name: "RileyBenchmark Two",
      text: resume("RileyBenchmark Two", "Senior Backend Engineer", [
        STRONG_DESIGN,
        STRONG_DB,
        WEAK_TESTING,
        STRONG_OPS,
        STRONG_COMMS,
      ]),
      expected: {
        "system-design": "strong",
        databases: "strong",
        testing: "weak",
        ops: "strong",
        communication: "strong",
      },
      expectedRank: 2,
    },
    {
      id: "eval-mixed",
      name: "CaseySynthetic Three",
      text: resume("CaseySynthetic Three", "Backend Engineer", [
        WEAK_DESIGN,
        STRONG_DB,
        STRONG_TESTING,
        WEAK_OPS,
        WEAK_COMMS,
      ]),
      expected: {
        "system-design": "weak",
        databases: "strong",
        testing: "strong",
        ops: "weak",
        communication: "weak",
      },
      expectedRank: 3,
    },
    {
      id: "eval-junior-strong-comms",
      name: "DevPlaceholder Four",
      text: resume("DevPlaceholder Four", "Junior Backend Engineer", [
        WEAK_DESIGN,
        WEAK_DB,
        STRONG_TESTING,
        WEAK_OPS,
        STRONG_COMMS,
      ]),
      expected: {
        "system-design": "weak",
        databases: "weak",
        testing: "strong",
        ops: "weak",
        communication: "strong",
      },
      expectedRank: 4,
    },
    {
      id: "eval-weak-mostly",
      name: "ElliSample Five",
      text: resume("ElliSample Five", "Backend Developer", [
        WEAK_DESIGN,
        WEAK_DB,
        WEAK_TESTING,
        STRONG_OPS,
        WEAK_COMMS,
      ]),
      expected: {
        "system-design": "weak",
        databases: "weak",
        testing: "weak",
        ops: "strong",
        communication: "weak",
      },
      expectedRank: 5,
    },
    {
      id: "eval-weak-all",
      name: "FrankFixture Six",
      text: resume("FrankFixture Six", "Junior Developer", [
        WEAK_DESIGN,
        WEAK_DB,
        WEAK_TESTING,
        WEAK_OPS,
        WEAK_COMMS,
      ]),
      expected: {
        "system-design": "weak",
        databases: "weak",
        testing: "weak",
        ops: "weak",
        communication: "weak",
      },
      expectedRank: 6,
    },
  ];
}
