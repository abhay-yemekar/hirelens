import { describe, expect, it } from "vitest";

import { detectAiContent } from "./ai-content.js";

/** Human-ish text: irregular lengths, concrete numbers, no buzz phrase spam. */
const HUMAN = `I run the payments backend at FintechScale.
Joined 2021 as the fourth engineer; we shipped the first card product that October.
Fixed a Kafka consumer bug that had been double-charging merchants every third retry — about $14k/month.
Now I own on-call rotation design and interview loops for backend roles.
I also mentor two juniors and write the incident postmortems.
Outside work I restore old bicycles.`;

/** AI-ish text: buzz phrase spam, triples, polished transitions, uniform rhythm. */
const AIISH = `Results-driven and detail-oriented professional with a proven track record.
Spearheaded multiple initiatives, seamlessly integrated cutting-edge solutions, and fostered a culture of excellence.
Moreover, demonstrated proficiency in navigating the complexities of modern systems.
Furthermore, orchestrated pivotal improvements with unparalleled dedication and a holistic approach.
Additionally, expertly managed stakeholder relationships with keen understanding and strong acumen.
Notably, embarked on a journey of continuous improvement and innovation.
Consequently, achieved remarkable outcomes through strategic positioning.
Overall, a testament to my unwavering commitment to excellence and growth.`;

describe("AI-content detection", () => {
  it("rates naturally written text as low", () => {
    const report = detectAiContent(HUMAN);
    expect(report.level).toBe("low");
    expect(report.score).toBeLessThan(30);
  });

  it("flags AI-typical prose as notable with named signals", () => {
    const report = detectAiContent(AIISH);
    expect(report.level).toBe("notable");
    expect(report.score).toBeGreaterThanOrEqual(55);
    expect(report.signals.some((s) => s.signal === "phrase")).toBe(true);
  });

  it("degrades honestly on short text", () => {
    const report = detectAiContent("Short bullet resume.\n- Did things\n- More things");
    expect(report.level).toBe("insufficient_text");
    expect(report.score).toBeNull();
  });

  it("is deterministic", () => {
    expect(detectAiContent(AIISH)).toEqual(detectAiContent(AIISH));
  });

  it("caps signals for readable UI", () => {
    const report = detectAiContent(`${AIISH}\n${AIISH}`);
    expect(report.signals.length).toBeLessThanOrEqual(10);
  });
});
