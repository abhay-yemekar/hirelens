import { describe, expect, it } from "vitest";
import {
  auditLog,
  candidates,
  chunks,
  decisions,
  demographics,
  documents,
  evidence,
  jobs,
  organization,
  rubrics,
  scores,
  scoringRuns,
  session,
  user,
} from "./src/index.js";
import { jobStatusEnum, scoringRunStatusEnum, stageEnum } from "./src/schema/enums.js";

describe("schema shape", () => {
  it("exposes every planned table", () => {
    const tables = [
      user,
      session,
      organization,
      jobs,
      rubrics,
      candidates,
      documents,
      chunks,
      scoringRuns,
      scores,
      evidence,
      decisions,
      auditLog,
      demographics,
    ];
    for (const t of tables) {
      expect(Object.keys(t).length).toBeGreaterThan(0);
    }
  });

  it("pins enum values", () => {
    expect(jobStatusEnum.enumValues).toEqual(["draft", "open", "closed"]);
    expect(stageEnum.enumValues).toEqual(["new", "shortlisted", "advanced", "rejected"]);
    expect(scoringRunStatusEnum.enumValues).toEqual(["pending", "running", "completed", "failed"]);
  });

  it("uses temperature 0 by default for deterministic scoring", () => {
    expect(scoringRuns.temperature.default).toBe(0);
  });
});
