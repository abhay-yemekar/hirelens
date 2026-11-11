import { describe, expect, it } from "vitest";
import {
  countKeyword,
  findKeyword,
  KEYWORD_MATCH_SHARE,
  keywordTerms,
  rankByKeywords,
} from "./keywords.js";

describe("keywordTerms", () => {
  it("drops grammar words, request words and resume headings", () => {
    expect(keywordTerms("Who has experience with payments?")).toEqual(["payments"]);
    expect(keywordTerms("keeping production up and handling outages")).toEqual([
      "keeping",
      "production",
      "handling",
      "outages",
    ]);
    expect(keywordTerms("on-call experience")).toEqual(["call"]);
  });

  it("keeps technology names with symbols and inner dots", () => {
    expect(keywordTerms("C++, C# and Node.js.")).toEqual(["c++", "c#", "node.js"]);
  });

  it("drops one-letter words and repeats, and keeps at most 8 terms", () => {
    expect(keywordTerms("kafka Kafka x")).toEqual(["kafka"]);
    expect(keywordTerms("a1 b2 c3 d4 e5 f6 g7 h8 i9 j10")).toHaveLength(8);
  });

  it("finds nothing to search for in a query of stop words", () => {
    expect(keywordTerms("who has the experience")).toEqual([]);
  });
});

describe("findKeyword", () => {
  it("matches where a word starts, with any ending", () => {
    expect(findKeyword("skills: postgresql, redis", "postgres")).toBe(8);
    expect(findKeyword("managed kubernetes clusters", "kuber")).toBe(8);
    expect(findKeyword("designed the schema", "design")).toBe(0);
  });

  it("doesn't match inside a word", () => {
    expect(findKeyword("cut the update time", "date")).toBe(-1);
    expect(findKeyword("resume upload service", "load")).toBe(-1);
    expect(findKeyword("built android apps", "roid")).toBe(-1);
  });

  it("needs a two-letter term to be the whole word or its plural", () => {
    expect(findKeyword("good google goals", "go")).toBe(-1);
    expect(findKeyword("rust, go, typescript", "go")).toBe(6);
    expect(findKeyword("design systems and uis", "ui")).toBe(19);
  });

  it("finds the singular of a plural term, as a whole word", () => {
    expect(findKeyword("queue for payment notifications", "payments")).toBe(10);
    expect(findKeyword("added a redirect", "redis")).toBe(-1);
    expect(findKeyword("led the class", "class")).toBe(8);
  });

  it("counts every match", () => {
    expect(countKeyword("kafka streams; kafka connect; kafkaesque", "kafka")).toBe(3);
    expect(countKeyword("no match here", "kafka")).toBe(0);
  });
});

describe("rankByKeywords", () => {
  const docs = [
    { id: "liam", text: "Owned design-system components. B.A. Graphic Design." },
    { id: "marcus", text: "Led the design of a consistency model." },
    { id: "amelia", text: "Better transaction design." },
    { id: "noah", text: "Built REST APIs." },
  ];
  const rank = (q: string) => rankByKeywords(docs, q, (d) => d.text).map((m) => m.doc.id);

  it("weighs a rare term over a common one and drops matches on the common one alone", () => {
    // "design" is in three of the four; "graphic" only in Liam's.
    expect(rank("graphic design background")).toEqual(["liam"]);
  });

  it("lists every match for a single term, most mentions first", () => {
    expect(rank("design")).toEqual(["liam", "marcus", "amelia"]);
  });

  it("keeps a resume with one of two rare terms", () => {
    const stack = [
      { id: "olivia", text: "Prometheus, Grafana, Kafka" },
      { id: "david", text: "Prometheus, Terraform" },
      { id: "liam", text: "React, CSS" },
    ];
    const ranked = rankByKeywords(stack, "prometheus grafana", (d) => d.text);
    expect(ranked.map((m) => m.doc.id)).toEqual(["olivia", "david"]);
    const [best, second] = ranked;
    expect((second?.score ?? 0) / (best?.score ?? 1)).toBeGreaterThanOrEqual(KEYWORD_MATCH_SHARE);
  });

  it("returns nothing for a stop-word query or an empty job", () => {
    expect(rank("who has the experience")).toEqual([]);
    expect(rankByKeywords([], "kafka", (d: { text: string }) => d.text)).toEqual([]);
  });

  it("says where the first matching term starts", () => {
    const [match] = rankByKeywords(docs.slice(1, 2), "consistency design", (d) => d.text);
    expect(match?.firstIndex).toBe("Led the ".length);
  });
});
