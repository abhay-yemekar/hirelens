import { describe, expect, it } from "vitest";
import { locateEvidenceSpan, locateEvidenceSpans } from "./textSpan.js";

describe("locateEvidenceSpan", () => {
  it("finds an exact match with correct offsets", () => {
    const doc = "Name: Ada\nSkills: Python, Docker\n";
    const span = locateEvidenceSpan(doc, "Python");
    expect(span?.quotedText).toBe("Python");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toBe("Python");
  });

  it("tolerates whitespace differences via fallback", () => {
    const doc = "Led  the  migration   of services";
    const span = locateEvidenceSpan(doc, "Led the migration");
    expect(span?.startOffset).toBe(0);
    expect(span?.quotedText.replace(/\s+/g, " ")).toBe("Led the migration");
  });

  it("returns null for text not in the document", () => {
    expect(locateEvidenceSpan("alpha beta", "gamma")).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(locateEvidenceSpan("alpha beta", "")).toBeNull();
  });

  // Regression: gpt-oss quoted "on\u2011call" (non-breaking hyphen) for a
  // resume that says "on-call", so the score was withheld.
  it("matches a non-breaking hyphen in the quote to an ASCII hyphen", () => {
    const doc = "- CI/CD pipelines, monitoring, and on-call for web services.";
    const span = locateEvidenceSpan(doc, "on\u2011call for web services.");
    expect(span?.quotedText).toBe("on-call for web services.");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toBe(span?.quotedText);
  });

  it("matches every dash variant, both ways, and keeps the resume's own text", () => {
    for (const dash of ["\u2010", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212"]) {
      const doc = `Senior Engineer ${dash} Acme ${dash} 2021${dash}present`;
      expect(locateEvidenceSpan(doc, "Acme - 2021-present")?.quotedText).toBe(
        `Acme ${dash} 2021${dash}present`,
      );
      expect(locateEvidenceSpan("Acme - 2021-present", `Acme ${dash} 2021`)?.startOffset).toBe(0);
    }
  });

  it("matches curly quotes to straight quotes", () => {
    const doc = "Won the \u201CBest Platform\u201D award for the team\u2019s work";
    const span = locateEvidenceSpan(doc, `"Best Platform" award for the team's work`);
    expect(span?.quotedText).toBe(doc.slice("Won the ".length));
  });

  it("folds variants in the whitespace fallback too", () => {
    const doc = "Owned  on\u2011call\n  rotation";
    const span = locateEvidenceSpan(doc, "on-call rotation");
    expect(span?.startOffset).toBe(7);
    expect(span?.endOffset).toBe(doc.length);
  });

  it("still rejects quotes that differ by more than typography", () => {
    expect(locateEvidenceSpan("on-call for web services", "on call for web services")).toBeNull();
  });

  it("maps a mid-document match back to source offsets", () => {
    const doc = "EXPERIENCE\nBuilt  a  pipeline\nEDUCATION";
    const span = locateEvidenceSpan(doc, "Built a pipeline");
    expect(doc.slice(span?.startOffset ?? -1, span?.endOffset ?? -1)).toContain("Built");
  });
});

// The live demo's synthetic "Jordan Avery" resume (apps/web/src/lib/demo-data.ts).
const JORDAN = `Jordan Avery
Senior Backend Engineer — San Francisco, CA — jordan.avery@example.com

EXPERIENCE

Senior Backend Engineer — Acme Corp — 2021–present
- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.
- Built event-driven services in TypeScript on Node.js handling 40k req/s.
- Designed idempotent webhook delivery with a Postgres-backed outbox table.
- Introduced SLO dashboards and on-call runbooks; MTTR down 45%.

Backend Engineer — Northwind Systems — 2018–2021
- Owned PostgreSQL schema for a 200M-row ledger; cut slow queries 60%.
- Built retry queues with exponential backoff for third-party integrations.
- Participated in weekly incident reviews and postmortems.

SKILLS
TypeScript, Node.js, Go, PostgreSQL, Redis, Kafka, Kubernetes, Terraform, AWS

EDUCATION
B.S. Computer Science, State University (2014–2018)`;

const LED = "Led migration of the payments platform to Kubernetes, cutting deploy time 80%.";
const EVENTS = "Built event-driven services in TypeScript on Node.js handling 40k req/s.";
const WEBHOOKS = "Designed idempotent webhook delivery with a Postgres-backed outbox table.";
const LEDGER = "Owned PostgreSQL schema for a 200M-row ledger; cut slow queries 60%.";
const RETRIES = "Built retry queues with exponential backoff for third-party integrations.";

/** Every span must be the resume's own text at its offsets. */
function expectVerbatim(spans: ReturnType<typeof locateEvidenceSpans>): void {
  for (const span of spans ?? []) {
    expect(JORDAN.slice(span.startOffset, span.endOffset)).toBe(span.quotedText);
  }
}

describe("locateEvidenceSpans", () => {
  // Recorded from gemini-2.5-flash scoring the live demo on 8 Nov 2026. It
  // joined bullets from separate lines (and separate roles) into one quote,
  // dropping the "- " markers, so 4 of 6 scores were withheld.
  const recorded: Array<{ key: string; quote: string; lines: string[] }> = [
    {
      key: "event-driven-systems",
      quote: `${EVENTS} ${WEBHOOKS} ${RETRIES}`,
      lines: [EVENTS, WEBHOOKS, RETRIES],
    },
    { key: "distributed-systems", quote: `${WEBHOOKS} ${RETRIES}`, lines: [WEBHOOKS, RETRIES] },
    { key: "fintech-payments", quote: `${LED} ${LEDGER}`, lines: [LED, LEDGER] },
    {
      key: "platform-tooling",
      quote: `${LED} Kubernetes, Terraform`,
      lines: [LED, "Kubernetes, Terraform"],
    },
  ];

  for (const { key, quote, lines } of recorded) {
    it(`finds each line of the recorded ${key} quote`, () => {
      expect(locateEvidenceSpan(JORDAN, quote)).toBeNull();
      const spans = locateEvidenceSpans(JORDAN, quote);
      expect(spans?.map((s) => s.quotedText)).toEqual(lines);
      expectVerbatim(spans);
    });
  }

  it("returns one span for a quote that is a single passage", () => {
    // gemini-3.8-flash quoted one bullet per criterion on the same resume.
    const spans = locateEvidenceSpans(JORDAN, LEDGER);
    expect(spans).toHaveLength(1);
    expect(spans?.[0]).toEqual(locateEvidenceSpan(JORDAN, LEDGER));
  });

  it("withholds a joined quote when any line is not in the resume", () => {
    expect(locateEvidenceSpans(JORDAN, `${LED} Ran a 40-node Kafka cluster.`)).toBeNull();
    expect(locateEvidenceSpans(JORDAN, `Ran a 40-node Kafka cluster. ${LED}`)).toBeNull();
  });

  it("withholds a joined quote that paraphrases one line", () => {
    const paraphrase = "Led the payments migration to Kubernetes, cutting deploy time 80%.";
    expect(locateEvidenceSpans(JORDAN, `${paraphrase} ${LEDGER}`)).toBeNull();
  });

  it("splits at ellipses", () => {
    for (const ellipsis of ["...", "\u2026", " ... "]) {
      const spans = locateEvidenceSpans(
        JORDAN,
        `Led migration of the payments platform${ellipsis}MTTR down 45%`,
      );
      expect(spans?.map((s) => s.quotedText)).toEqual([
        "Led migration of the payments platform",
        "MTTR down 45%",
      ]);
    }
  });

  it("splits at line breaks and ignores the list markers the model kept or swapped", () => {
    const quote = `\u2022 ${RETRIES}\n\u2022 Participated in weekly incident reviews and postmortems.`;
    const spans = locateEvidenceSpans(JORDAN, quote);
    expect(spans?.map((s) => s.quotedText)).toEqual([
      RETRIES,
      "Participated in weekly incident reviews and postmortems.",
    ]);
    expectVerbatim(spans);
  });

  it("accepts a closing period the resume line does not have", () => {
    const spans = locateEvidenceSpans(JORDAN, `${LED} Kubernetes, Terraform, AWS.`);
    expect(spans?.map((s) => s.quotedText)).toEqual([LED, "Kubernetes, Terraform, AWS"]);
  });

  it("keeps sentences that sit together in the resume as one span", () => {
    const doc = "Shipped v2. Cut costs 30%.\nMentored 3 engineers.\nOther line.";
    const spans = locateEvidenceSpans(doc, "Shipped v2. Cut costs 30%. Other line.");
    expect(spans?.map((s) => s.quotedText)).toEqual(["Shipped v2. Cut costs 30%.", "Other line."]);
  });

  it("does not repeat a line the model quoted twice", () => {
    expect(locateEvidenceSpans(JORDAN, `${LED} ${LED}`)?.map((s) => s.quotedText)).toEqual([LED]);
  });

  it("returns null for an empty or punctuation-only quote", () => {
    expect(locateEvidenceSpans(JORDAN, "")).toBeNull();
    expect(locateEvidenceSpans(JORDAN, " \n ")).toBeNull();
    expect(locateEvidenceSpans(JORDAN, "\u2026")).toBeNull();
  });

  // A quadratic regex would take minutes on these; linear code takes milliseconds.
  it("stays fast on long runs of spaces or punctuation", () => {
    expect(locateEvidenceSpans(JORDAN, `a${" ".repeat(100_000)}b`)).toBeNull();
    expect(locateEvidenceSpans(JORDAN, `${"!".repeat(100_000)}x`)).toBeNull();
    expect(locateEvidenceSpans(JORDAN, `${LED}${" ".repeat(100_000)}`)?.[0]?.quotedText).toBe(LED);
  });
});
