import { describe, expect, it } from "vitest";

import { candidateFamilies, knownSkills, skillGraph, skillsInText } from "./graph.js";

describe("skill graph", () => {
  it("matches known skills and normalizes aliases", () => {
    const { matched, missing } = skillGraph(
      ["Postgres", "typescript", "  Docker  "],
      ["PostgreSQL", "TypeScript", "Docker", "Kubernetes"],
    );
    expect(matched).toContain("PostgreSQL");
    expect(matched).toContain("TypeScript");
    expect(matched).toContain("Docker");
    expect(missing).toEqual(["Kubernetes"]);
  });

  it("computes adjacency from family overlap, excluding matched skills", () => {
    const { adjacent, matched } = skillGraph(["Terraform", "Ansible", "Photoshop"], ["Kubernetes"]);
    expect(matched).toEqual([]);
    expect(adjacent).toContain("Terraform"); // cloud+devops, same families as Kubernetes
    expect(adjacent).toContain("Ansible"); // devops
    expect(adjacent).not.toContain("Photoshop"); // design — unrelated family
  });

  it("ignores unknown skills entirely (no hallucinated adjacency)", () => {
    const { adjacent } = skillGraph(["Whispernet Weaving", "Quantum Loom"], ["Kubernetes"]);
    expect(adjacent).toEqual([]);
  });

  it("handles empty inputs", () => {
    expect(skillGraph([], ["SQL"])).toEqual({ matched: [], adjacent: [], missing: ["SQL"] });
    expect(skillGraph(["SQL"], [])).toEqual({ matched: [], adjacent: [], missing: [] });
  });

  it("dedupes candidate skill lists", () => {
    expect(knownSkills(["Docker", "docker", "DOCKER "])).toHaveLength(1);
  });

  it("reports candidate families for the strength profile", () => {
    const families = candidateFamilies(["Python", "PyTorch", "AWS", "Figma"]);
    expect(families).toContain("ml");
    expect(families).toContain("cloud");
    expect(families).toContain("design");
    expect(families).not.toContain("finance");
  });

  it("extracts skills from free JD text with word boundaries", () => {
    const skills = skillsInText(
      "We need strong Go and PostgreSQL experience. Kafka a plus. You will ship with Docker and Kubernetes on GCP.",
    );
    expect(skills).toContain("Go");
    expect(skills).toContain("PostgreSQL");
    expect(skills).toContain("Kafka");
    expect(skills).toContain("Docker");
    expect(skills).toContain("Kubernetes");
    expect(skills).toContain("GCP");
  });

  it("does not match letters inside words", () => {
    expect(skillsInText("We reward people who go above and beyond")).not.toContain("Go");
    expect(skillsInText("organize the annual raffle")).not.toContain("R");
    expect(skillsInText("Learning quickly is key")).toEqual([]);
  });

  it("resolves common JD aliases", () => {
    const skills = skillsInText("Experience with Postgres, k8s, and Node required.");
    expect(skills).toContain("PostgreSQL");
    expect(skills).toContain("Kubernetes");
    expect(skills).toContain("Node.js");
  });
});
