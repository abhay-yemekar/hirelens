import { describe, expect, it } from "vitest";
import { parseCandidate } from "./candidate.js";
import { findPhone } from "./contact.js";
import { ParseError } from "./schema.js";
import { segmentSections } from "./sections.js";

const RESUME = `JORDAN AVERY
Senior Backend Engineer - San Francisco, CA - jordan@example.com - github.com/javery

EXPERIENCE

Senior Backend Engineer - Acme Corp - Mar 2021 - Present
- Led migration of the payments platform to Kubernetes.
- Built event-driven services in TypeScript handling 40k req/s.

Backend Engineer - Globex - 2018 - 2021
- Owned the billing service end to end.

EDUCATION

BSc Computer Science - University of California - 2018

SKILLS

TypeScript, Node.js, PostgreSQL, Kubernetes, Docker, Redis

CERTIFICATIONS

AWS Solutions Architect Associate (2020)

Summary
Engineer focused on reliable payments infrastructure and clean APIs.`;

describe("findPhone", () => {
  it("rejects employment year ranges (2019-2024)", () => {
    expect(findPhone(["Experience", "2019-2024", "2018 - 2022", "(555) 123-4567"])).toBe(
      "(555) 123-4567",
    );
    expect(findPhone(["Senior Engineer", "Mar 2019-2024 · Acme"])).toBeNull();
  });
});

describe("parseCandidate", () => {
  it("parses contact details from the header", () => {
    const c = parseCandidate(RESUME);
    expect(c.name).toBe("JORDAN AVERY");
    expect(c.email).toBe("jordan@example.com");
    // Year ranges on the line below must not be mistaken for a phone.
    expect(c.phone).toBeNull();
    expect(c.profiles).toEqual([
      { network: "github", username: "javery", url: "https://github.com/javery" },
    ]);
    expect(c.language).toBe("en");
  });

  it("parses two work entries with dates", () => {
    const c = parseCandidate(RESUME);
    expect(c.work).toHaveLength(2);
    expect(c.work[0]).toMatchObject({
      name: "Acme Corp",
      position: "Senior Backend Engineer",
      startDate: "Mar 2021",
      endDate: "present",
      current: true,
    });
    expect(c.work[1]).toMatchObject({ name: "Globex", endDate: "2021" });
  });

  it("parses education, skills, and certifications", () => {
    const c = parseCandidate(RESUME);
    expect(c.education[0]).toMatchObject({
      institution: "University of California",
      studyType: "Bsc",
    });
    expect(c.skills).toContain("TypeScript");
    expect(c.skills).toContain("PostgreSQL");
    expect(c.certifications).toContain("AWS Solutions Architect Associate (2020)");
  });

  describe("compact resume forms", () => {
    it('parses inline section headers ("SKILLS: TypeScript, Postgres")', () => {
      const c = parseCandidate(`MAYA LIN
maya@example.com - (555) 010-4821

EXPERIENCE: Backend Engineer at Northwind, 2021 to present

SKILLS: Go, PostgreSQL, Redis, Docker

EDUCATION: BSc Computer Science - University of Toronto - 2020`);
      expect(c.skills).toContain("Go");
      expect(c.skills).toContain("PostgreSQL");
      expect(c.skills).toContain("Redis");
      expect(c.skills).toContain("Docker");
      expect(c.work[0]).toMatchObject({ position: "Backend Engineer", name: "Northwind" });
      expect(c.education[0]).toMatchObject({ institution: "University of Toronto" });
    });

    it("does not treat prose that starts with a section word as a header", () => {
      const c = parseCandidate(`ALEX RIVERA
alex@example.com

Skills improve the match when they appear in context.

EXPERIENCE

Roofer - Acme Roofing - 2019 - 2021`);
      expect(c.skills).toEqual([]);
      expect(c.work[0]).toMatchObject({ position: "Roofer", name: "Acme Roofing" });
    });

    it('parses slash-separated skill lists ("TypeScript/React/Node")', () => {
      const c = parseCandidate(`SAM ORTIZ
sam@example.com

EXPERIENCE

Full-Stack Developer - Hills Inc - 2020 - Present

SKILLS

TypeScript/React/Node.js/GraphQL`);
      expect(c.skills).toContain("TypeScript");
      expect(c.skills).toContain("React");
      expect(c.skills).toContain("Node.js");
      expect(c.skills).toContain("GraphQL");
    });

    it("parses two-space-separated skill tokens", () => {
      const c = parseCandidate(`KIM DIAZ
kim@example.com

EXPERIENCE

Data Engineer - FlowCo - 2020 - Present

SKILLS

Python  SQL  Spark  Airflow`);
      expect(c.skills).toContain("Python");
      expect(c.skills).toContain("SQL");
      expect(c.skills).toContain("Spark");
      expect(c.skills).toContain("Airflow");
    });

    it("parses work roles densely stacked on consecutive lines", () => {
      const c = parseCandidate(`IVA NOVA
iva@example.com

EXPERIENCE

Senior Engineer - Acme - 2022 - Present
Engineer - Globex - 2019 - 2022
Junior Engineer - Initech - 2017 - 2019`);
      expect(c.work).toHaveLength(3);
      expect(c.work[0]).toMatchObject({ name: "Acme", position: "Senior Engineer" });
      expect(c.work[1]).toMatchObject({ name: "Globex", position: "Engineer" });
      expect(c.work[2]).toMatchObject({ name: "Initech", position: "Junior Engineer" });
    });

    it("parses skills-only compact resumes (no experience section)", () => {
      const c = parseCandidate(`NOOR KHAN
noor@example.com

SKILLS: Kubernetes, Terraform, AWS`);
      expect(c.skills).toContain("Kubernetes");
      expect(c.skills).toContain("Terraform");
      expect(c.skills).toContain("AWS");
    });
  });

  it("rejects content-free text with a typed error", () => {
    expect(() => parseCandidate("...")).toThrow(ParseError);
    expect(() => parseCandidate("a b c")).toThrow(/too little text/i);
  });

  it("segments sections case-insensitively", () => {
    const sections = segmentSections(RESUME.split("\n").filter((l) => l.trim()));
    expect(sections.has("experience")).toBe(true);
    expect(sections.has("education")).toBe(true);
    expect(sections.has("skills")).toBe(true);
  });
});
