import { describe, expect, it } from "vitest";
import { checkFormat } from "./ats-format.js";

const CLEAN_RESUME = `JORDAN AVERY
Senior Backend Engineer - San Francisco, CA - jordan@example.com - 555-0100

EXPERIENCE

Senior Backend Engineer - Acme Corp - Mar 2021 - Present
- Led migration of the payments platform to Kubernetes.
- Built event-driven services in TypeScript handling 40k req/s.

Backend Engineer - Globex - 2018 - 2021
- Owned the billing service end to end.

EDUCATION

BSc Computer Science - University of California - 2018

SKILLS

TypeScript, Node.js, PostgreSQL, Kubernetes, Docker, Redis`;

describe("checkFormat", () => {
  it("passes a clean single-column resume with no findings", () => {
    const check = checkFormat(CLEAN_RESUME);
    expect(check.verdict).toBe("pass");
    expect(check.score).toBe(100);
    expect(check.findings).toEqual([]);
  });

  it("fails empty text with no-text only", () => {
    const check = checkFormat("   \n\t\n  ");
    expect(check.verdict).toBe("fail");
    expect(check.score).toBe(0);
    expect(check.findings).toHaveLength(1);
    expect(check.findings[0]?.code).toBe("no-text");
  });

  it("flags table-style pipe rows", () => {
    const table = `JORDAN AVERY
jordan@example.com

EXPERIENCE
Engineer | Acme | 2020 | 2024
Engineer | Globex | 2018 | 2020
Manager | Initech | 2016 | 2018
Associate | Umbrella | 2014 | 2016
Intern | Cyberdyne | 2013 | 2014

EDUCATION
BSc - State University - 2013

SKILLS
TypeScript, Docker, Kubernetes, SQL, React, Git, CI/CD, Jest`;
    const check = checkFormat(table);
    expect(check.findings.some((f) => f.code === "table-layout")).toBe(true);
    expect(check.verdict).toBe("warn");
  });

  it("flags fragmented short-line column artifacts", () => {
    // Simulates a PDF whose two-column content got read in fragments:
    // many <=6 char lines among enough non-empty lines to cross the gate.
    const lines: string[] = ["JORDAN AVERY", "jordan@example.com", "555-0100"];
    const words = [
      "Acme",
      "Corp",
      "Mar",
      "2021",
      "Kubernetes",
      "TypeScript",
      "PostgreSQL",
      "Docker",
    ];
    for (let i = 0; i < 6; i++) {
      lines.push("EXPERIENCE", "SKILLS", "EDUCATION", ...words);
    }
    for (let i = 0; i < 40; i++) lines.push("Ab", "K8s", "Go", "C++", "SQL", "git");
    const check = checkFormat(lines.join("\n"));
    expect(check.findings.some((f) => f.code === "column-artifacts")).toBe(true);
  });

  it("flags mojibake encoding artifacts", () => {
    const text = `JORDAN AVERY
jordan@example.com

EXPERIENCE
- Built caf\u00C3\u00A9 ordering systems na\u00C3\u00AFve to load.
- Migrated r\u00C3\u00A9sum\u00C3\u00A9s to the platform, a caf\u00C3\u00A9 of services.
- Ran the na\u00C3\u00AFve benchmark, caf\u00C3\u00A9 and r\u00C3\u00A9sum\u00C3\u00A9 cleanups.

SKILLS
TypeScript, Node.js, PostgreSQL, Docker, Kubernetes, Redis, Git, CI`;
    const check = checkFormat(text);
    expect(check.findings.some((f) => f.code === "encoding")).toBe(true);
  });

  it("warns on structure gaps: missing phone and skills", () => {
    const text = `JORDAN AVERY
jordan@example.com

EXPERIENCE

Backend Engineer - Acme Corp - 2020 - Present
- Led migration of the payments platform.
- Built event-driven services in TypeScript.
- Owned billing integrations end to end.

EDUCATION

BSc Computer Science - State University - 2018`;
    const check = checkFormat(text);
    expect(check.findings.some((f) => f.code === "no-phone")).toBe(true);
    expect(check.findings.some((f) => f.code === "no-skills")).toBe(true);
    expect(check.verdict).toBe("warn");
    expect(check.score).toBeGreaterThanOrEqual(80);
  });

  it("fails when nothing is parseable", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Random line ${i + 1} of prose`).join("\n");
    const check = checkFormat(text);
    expect(check.findings.some((f) => f.code === "unparseable")).toBe(true);
    expect(check.verdict).toBe("fail");
  });

  it("is deterministic: same text, same report", () => {
    const a = checkFormat(CLEAN_RESUME);
    const b = checkFormat(CLEAN_RESUME);
    expect(a).toEqual(b);
  });
});
