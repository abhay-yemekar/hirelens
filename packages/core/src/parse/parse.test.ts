import { describe, expect, it } from "vitest";
import { parseCandidate } from "./candidate.js";
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

describe("parseCandidate", () => {
  it("parses contact details from the header", () => {
    const c = parseCandidate(RESUME);
    expect(c.name).toBe("JORDAN AVERY");
    expect(c.email).toBe("jordan@example.com");
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
