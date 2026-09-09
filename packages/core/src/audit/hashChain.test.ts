import { describe, expect, it } from "vitest";
import { AuditChain, GENESIS } from "./hashChain.js";

describe("AuditChain", () => {
  it("chains records with prevHash linkage", () => {
    const chain = new AuditChain<{ n: number }>();
    const r1 = chain.append("score", { n: 1 }, new Date(0));
    const r2 = chain.append("score", { n: 2 }, new Date(1));
    expect(r1.prevHash).toBe(GENESIS);
    expect(r2.prevHash).toBe(r1.hash);
    expect(chain.verify()).toBe(true);
    expect(chain.length).toBe(2);
  });

  it("detects tampering", () => {
    const chain = new AuditChain<{ n: number }>();
    chain.append("score", { n: 1 }, new Date(0));
    const r2 = chain.append("score", { n: 2 }, new Date(1));
    r2.payload.n = 999; // tamper
    expect(chain.verify()).toBe(false);
  });

  it("produces deterministic hashes for identical inputs", () => {
    const a = new AuditChain<number>();
    const b = new AuditChain<number>();
    const ra = a.append("act", 7, new Date(0));
    const rb = b.append("act", 7, new Date(0));
    expect(ra.hash).toBe(rb.hash);
  });
});
