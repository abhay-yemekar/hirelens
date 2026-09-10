/**
 * Integration test for the batch orchestrator. Skips unless DATABASE_URL
 * points at a live Postgres+pgvector (docker compose up -d postgres, or
 * the CI service container), with migrations applied (db:migrate).
 */

import { createMockModel, GENESIS, hashLink, type LanguageModel } from "@hirelens/core";
import {
  auditLog,
  candidates,
  createDb,
  type Database,
  documents,
  evidence,
  jobs,
  organization,
  rubrics,
  scores,
  scoringRuns,
  user,
} from "@hirelens/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runBatch } from "../src/index.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;

const ORG_ID = "org-orchestrator-test";
const USER_ID = "user-orchestrator-test";
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RUBRIC_ID = "22222222-2222-4222-8222-222222222222";

const LEVELS = [
  { label: "0", description: "none" },
  { label: "1", description: "minimal" },
  { label: "2", description: "basic" },
  { label: "3", description: "solid" },
  { label: "4", description: "strong" },
  { label: "5", description: "expert" },
];

const CRITERIA = ["system-design", "databases", "testing", "ops", "communication"].map(
  (key, i) => ({
    key,
    title: key,
    weight: i === 0 ? 3 : 1,
    scale: LEVELS,
    doNotUse: [],
  }),
);

const RUBRIC_PAYLOAD = {
  version: 1,
  key: "backend-eng",
  title: "Backend Engineer",
  criteria: CRITERIA,
  exclusions: [],
};

const RESUME = `JORDAN AVERY
Senior Backend Engineer - jordan@example.com

EXPERIENCE
Senior Backend Engineer - Acme Corp - 2021 - Present
- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.
`;

const QUOTE = "Led migration of the payments platform to Kubernetes";

function candidateId(n: number): string {
  return `33333333-3333-4333-8333-33333333333${n}`;
}

function documentId(n: number): string {
  return `44444444-4444-4444-8444-44444444444${n}`;
}

function mockScores(): unknown {
  return {
    criteria: CRITERIA.map((c) => ({
      key: c.key,
      score: 3,
      confidence: 0.8,
      rationale: `Solid ${c.title}.`,
      quote: c.key === "system-design" ? QUOTE : "",
    })),
  };
}

async function seed(db: Database): Promise<void> {
  // Wipe any previous run of this fixture (org cascade covers jobs,
  // candidates, rubrics, audit; the user row must go separately).
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.insert(organization).values({
    id: ORG_ID,
    name: "Orchestrator Test Org",
    slug: `orchestrator-test-${Date.now()}`,
    createdAt: new Date(),
  });
  await db.insert(user).values({
    id: USER_ID,
    name: "Test Recruiter",
    email: `orchestrator-test-${Date.now()}@example.com`,
  });
  await db.insert(jobs).values({
    id: JOB_ID,
    orgId: ORG_ID,
    title: "Backend Engineer",
    description: "Build services.",
    status: "open",
  });
  await db.insert(rubrics).values({
    id: RUBRIC_ID,
    jobId: JOB_ID,
    version: 1,
    criteria: CRITERIA,
    payload: RUBRIC_PAYLOAD,
    createdBy: USER_ID,
  });
  for (let i = 1; i <= 5; i++) {
    await db.insert(candidates).values({
      id: candidateId(i),
      jobId: JOB_ID,
      contentHash: `hash-${i}`,
    });
    await db.insert(documents).values({
      id: documentId(i),
      candidateId: candidateId(i),
      rawText: RESUME,
    });
  }
}

describe.skipIf(!available)("batch orchestrator (integration)", () => {
  let db: Database;

  beforeAll(async () => {
    db = createDb(DATABASE_URL);
    await seed(db);
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, ORG_ID));
    await db.delete(user).where(eq(user.id, USER_ID));
  });

  it("scores a batch end-to-end and persists scores, evidence, and the run", async () => {
    const { model } = createMockModel({ args: mockScores() });
    const summary = await runBatch(db, model as LanguageModel, {
      jobId: JOB_ID,
      orgId: ORG_ID,
      actorId: USER_ID,
    });

    expect(summary.scored).toBe(5);
    expect(summary.failed).toBe(0);
    expect(summary.rubricVersion).toBe(1);

    const run = (await db.select().from(scoringRuns).where(eq(scoringRuns.id, summary.runId)))[0];
    expect(run?.status).toBe("completed");
    expect(run?.finishedAt).not.toBeNull();
    expect(run?.rubricVersion).toBe(1);

    const scoreRows = await db.select().from(scores).where(eq(scores.runId, summary.runId));
    expect(scoreRows).toHaveLength(25); // 5 candidates x 5 criteria

    const evidenceRows = await db.select().from(evidence);
    expect(evidenceRows.filter((e) => scoreRows.some((s) => s.id === e.scoreId))).toHaveLength(5);
    const firstEvidence = evidenceRows[0];
    expect(firstEvidence?.quotedText).toContain("Kubernetes");
  });

  it("appends a verifiable hash chain to the audit log", async () => {
    const { model } = createMockModel({ args: mockScores() });
    const summary = await runBatch(db, model as LanguageModel, {
      jobId: JOB_ID,
      orgId: ORG_ID,
      actorId: USER_ID,
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, ORG_ID))
      .orderBy(asc(auditLog.seq));
    expect(rows.length).toBeGreaterThanOrEqual(6); // 5 candidates + 1 batch, per run

    let prevHash = GENESIS;
    for (const row of rows) {
      expect(row.prevHash).toBe(prevHash);
      const expected = hashLink({
        action: row.action,
        payload: row.payload,
        prevHash,
        createdAt: row.createdAt,
      });
      expect(row.hash).toBe(expected);
      prevHash = row.hash;
    }

    const last = rows[rows.length - 1];
    expect(last?.action).toBe("scoring.batch.completed");
    const payloads = rows.map((r) => r.payload as Record<string, unknown>);
    expect(payloads.filter((p) => p["runId"] === summary.runId)).toHaveLength(6);
  });

  it("records per-candidate failures without aborting the batch", async () => {
    const { model } = createMockModel({ failWith: new Error("provider down") });
    const summary = await runBatch(db, model as LanguageModel, {
      jobId: JOB_ID,
      orgId: ORG_ID,
    });
    expect(summary.failed).toBe(5);
    expect(summary.results.every((r) => !r.ok)).toBe(true);
    const run = (await db.select().from(scoringRuns).where(eq(scoringRuns.id, summary.runId)))[0];
    expect(run?.status).toBe("completed");
  });
});
