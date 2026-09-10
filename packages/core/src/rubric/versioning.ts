/**
 * Rubrics are versioned, forkable, exportable, importable JSON artifacts.
 * This module owns the artifact lifecycle: fork with a version bump,
 * canonical serialization, and structural diffs between versions.
 */

import type { Criterion, Rubric } from "./schema.js";
import { RubricSchema } from "./schema.js";

/** Deep-clone a rubric and bump its version (fork semantics). */
export function forkRubric(rubric: Rubric, opts: { key?: string; title?: string } = {}): Rubric {
  const clone: Rubric = RubricSchema.parse(structuredClone(rubric));
  return {
    ...clone,
    version: clone.version + 1,
    ...(opts.key === undefined ? {} : { key: opts.key }),
    ...(opts.title === undefined ? {} : { title: opts.title }),
  };
}

/** Canonical JSON: sorted object keys, stable whitespace. Diffable and hashable. */
export function serializeRubric(rubric: Rubric): string {
  return `${JSON.stringify(sortKeysDeep(rubric), null, 2)}\n`;
}

/** Parse and validate a rubric from JSON text (import path). */
export function parseRubric(json: string): Rubric {
  return RubricSchema.parse(JSON.parse(json));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec).sort()) out[k] = sortKeysDeep(rec[k]);
    return out;
  }
  return value;
}

/** A human-readable line describing one structural difference. */
export interface RubricDiffLine {
  kind: "criteria-added" | "criteria-removed" | "weight-changed" | "scale-changed" | "meta-changed";
  /** Criterion key when the line concerns one criterion. */
  key?: string;
  detail: string;
}

function criterionMap(criteria: readonly Criterion[]): Map<string, Criterion> {
  return new Map(criteria.map((c) => [c.key, c]));
}

/**
 * Structural diff between two rubric versions. Ignores pure weight
 * normalization noise: two weights that differ only by float rounding
 * under normalization are not reported.
 */
export function diffRubrics(from: Rubric, to: Rubric): RubricDiffLine[] {
  const lines: RubricDiffLine[] = [];
  const a = criterionMap(from.criteria);
  const b = criterionMap(to.criteria);

  for (const [key, c] of a) {
    const other = b.get(key);
    if (!other) {
      lines.push({ kind: "criteria-removed", key, detail: `removed criterion "${c.title}"` });
      continue;
    }
    if (Math.abs(c.weight - other.weight) > 1e-9) {
      lines.push({
        kind: "weight-changed",
        key,
        detail: `weight ${c.weight} → ${other.weight}`,
      });
    }
    if (JSON.stringify(c.scale) !== JSON.stringify(other.scale)) {
      lines.push({ kind: "scale-changed", key, detail: `anchored scale rewritten` });
    }
  }
  for (const [key, c] of b) {
    if (!a.has(key)) {
      lines.push({ kind: "criteria-added", key, detail: `added criterion "${c.title}"` });
    }
  }
  if (from.title !== to.title) {
    lines.push({ kind: "meta-changed", detail: `title "${from.title}" → "${to.title}"` });
  }
  if (JSON.stringify(from.exclusions) !== JSON.stringify(to.exclusions)) {
    lines.push({ kind: "meta-changed", detail: "exclusions changed" });
  }
  return lines;
}
