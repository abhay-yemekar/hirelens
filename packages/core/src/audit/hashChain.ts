import { createHash } from "node:crypto";

/** A single append-only audit record with hash-chain linkage. */
export interface AuditRecord<T> {
  seq: number;
  action: string;
  payload: T;
  prevHash: string;
  hash: string;
  createdAt: string;
}

/** Genesis hash for an empty chain. */
export const GENESIS: string = "0".repeat(64);

function hashRecord(
  seq: number,
  action: string,
  payload: unknown,
  prevHash: string,
  createdAt: string,
): string {
  const canonical = JSON.stringify({ seq, action, payload, prevHash, createdAt });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Append-only, hash-chained audit log. Each record's hash covers its payload
 * plus the previous record's hash, so any tampering breaks verification.
 */
export class AuditChain<T> {
  private last: AuditRecord<T> | null = null;
  private readonly records: AuditRecord<T>[] = [];

  append(action: string, payload: T, now: Date = new Date()): AuditRecord<T> {
    const seq = this.last ? this.last.seq + 1 : 1;
    const prevHash = this.last ? this.last.hash : GENESIS;
    const createdAt = now.toISOString();
    const hash = hashRecord(seq, action, payload, prevHash, createdAt);
    const record: AuditRecord<T> = { seq, action, payload, prevHash, hash, createdAt };
    this.records.push(record);
    this.last = record;
    return record;
  }

  get length(): number {
    return this.records.length;
  }

  /** Verify the full chain; return false if any link is broken. */
  verify(): boolean {
    let prev = GENESIS;
    for (const r of this.records) {
      const expected = hashRecord(r.seq, r.action, r.payload, r.prevHash, r.createdAt);
      if (r.prevHash !== prev || r.hash !== expected) return false;
      prev = r.hash;
    }
    return true;
  }

  entries(): readonly AuditRecord<T>[] {
    return this.records;
  }
}
