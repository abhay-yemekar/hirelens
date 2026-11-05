import { describe, expect, it } from "vitest";
import { parseCandidate } from "./candidate.js";
import { findPhone } from "./contact.js";
import { extractDateRange } from "./dates.js";
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

  describe("role lines with en and em dashes", () => {
    it("reads title, company and dates around en and em dashes, spaced or not", () => {
      const c = parseCandidate(`RILEY QUINN
riley@example.com

EXPERIENCE

Data Engineer—Northwind Labs, Remote (Austin, TX) Jan 2024 – Present
- Built the ingestion pipeline.
Analytics Engineer – Contoso – 2021 – 2023
Junior Analyst—Fabrikam Inc. 2019—2021
Research Intern — Tailspin — 2018 - 2019`);
      expect(c.work).toHaveLength(4);
      expect(c.work[0]).toMatchObject({
        position: "Data Engineer",
        name: "Northwind Labs, Remote (Austin, TX)",
        startDate: "Jan 2024",
        endDate: "present",
        current: true,
      });
      expect(c.work[1]).toMatchObject({
        position: "Analytics Engineer",
        name: "Contoso",
        startDate: "2021",
        endDate: "2023",
      });
      expect(c.work[2]).toMatchObject({
        position: "Junior Analyst",
        name: "Fabrikam Inc.",
        startDate: "2019",
        endDate: "2021",
      });
      expect(c.work[3]).toMatchObject({ position: "Research Intern", name: "Tailspin" });
    });

    it("never splits hyphenated words", () => {
      const c = parseCandidate(`SAM ORTIZ
sam@example.com

EXPERIENCE

Front-end Engineer – Acme – 2022 – Present
Co-founder—Startly—2019 – 2022
Full-stack Developer - Globex - 2017 - 2019`);
      expect(c.work.map((w) => [w.position, w.name])).toEqual([
        ["Front-end Engineer", "Acme"],
        ["Co-founder", "Startly"],
        ["Full-stack Developer", "Globex"],
      ]);
    });

    it("gives a date line under the title to that role, whatever the dash", () => {
      const c = parseCandidate(`IVA NOVA
iva@example.com

EXPERIENCE

Platform Engineer — Initech
Mar 2020 - Present
- Ran the on-call rotation for 40 services.
Site Engineer – Hooli
2017 – 2020`);
      expect(c.work).toHaveLength(2);
      expect(c.work[0]).toMatchObject({
        position: "Platform Engineer",
        name: "Initech",
        startDate: "Mar 2020",
        endDate: "present",
      });
      expect(c.work[1]).toMatchObject({
        position: "Site Engineer",
        name: "Hooli",
        startDate: "2017",
        endDate: "2020",
      });
    });

    it("does not read achievement lines with a dash as roles", () => {
      const c = parseCandidate(`KIM DIAZ
kim@example.com

EXPERIENCE

Site Reliability Engineer – Umbrella Corp – 2020 – Present
- Cut p99 latency 40%—moved hot reads to Redis
• Owned incident review – wrote the runbooks
Rebuilt the alerting stack — paging volume fell by half.
Cut build times 10–20% across services
Cut p99 latency by 40% — moved hot reads to Redis
Reduced AWS spend by 30% – saving $1.2M/yr.
Grew the team from 5 – 12 engineers
◦ Owned incident review – wrote the runbooks
➢ Owned incident review – wrote the runbooks
\uf0b7 Owned incident review – wrote the runbooks
o Owned incident review – wrote the runbooks
1. Owned incident review – wrote the runbooks
– Owned incident review – wrote the runbooks
Platform Engineer – Globex – 2017 – 2020`);
      expect(c.work.map((w) => [w.position, w.name])).toEqual([
        ["Site Reliability Engineer", "Umbrella Corp"],
        ["Platform Engineer", "Globex"],
      ]);
    });

    it("still reads a bulleted role line that carries dates", () => {
      const c = parseCandidate(`NOOR KHAN
noor@example.com

EXPERIENCE

• Cloud Engineer – Wingtip – 2021 – 2024
◦ Data Engineer – Contoso – 2019 – 2021`);
      expect(c.work).toEqual([
        { position: "Cloud Engineer", name: "Wingtip", startDate: "2021", endDate: "2024" },
        { position: "Data Engineer", name: "Contoso", startDate: "2019", endDate: "2021" },
      ]);
    });

    it("keeps a company that starts like a month name", () => {
      const c = parseCandidate(`ALEX RIVERA
alex@example.com

EXPERIENCE

Engineer - Marriott 2019 - 2021
Analyst – Novartis 2016 – Present`);
      expect(c.work).toEqual([
        { position: "Engineer", name: "Marriott", startDate: "2019", endDate: "2021" },
        {
          position: "Analyst",
          name: "Novartis",
          startDate: "2016",
          endDate: "present",
          current: true,
        },
      ]);
    });

    it("reads month names written out or with a dot", () => {
      const c = parseCandidate(`ALEX RIVERA
alex@example.com

EXPERIENCE

Designer – Initech – September 2019 – June 2021
Intern – Hooli – Sept. 2018 – Mar. 2019`);
      expect(c.work[0]).toMatchObject({ startDate: "Sep 2019", endDate: "Jun 2021" });
      expect(c.work[1]).toMatchObject({ startDate: "Sep 2018", endDate: "Mar 2019" });
    });

    it("keeps a dashed company name whole when spaced dashes separate the parts", () => {
      const c = parseCandidate(`ALEX RIVERA
alex@example.com

EXPERIENCE

Engineer – Rolls–Royce – 2019 – 2021
Engineer | Acme (2015 - 2019)`);
      expect(c.work.map((w) => [w.position, w.name])).toEqual([
        ["Engineer", "Rolls–Royce"],
        ["Engineer", "Acme"],
      ]);
    });
  });

  it("reads long month-like text in linear time", () => {
    // The month pattern once ended in an open letter run, which took
    // seconds on text like this (quadratic). Generous bound for slow CI.
    const hostile = "Mar".repeat(50_000);
    const t0 = performance.now();
    expect(extractDateRange(hostile)).toBeNull();
    expect(extractDateRange(`${"Mar ".repeat(20_000)}2019 - 2021`)?.start).toBe("Mar 2019");
    expect(performance.now() - t0).toBeLessThan(1000);
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
