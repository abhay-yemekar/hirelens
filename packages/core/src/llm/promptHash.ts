import { createHash } from "node:crypto";

/**
 * Stable hash over everything that determines a generation: system,
 * prompt, schema id, temperature, seed, and model id. Used as the
 * `prompt_hash` determinism record on scoring runs.
 */
export function promptHash(parts: {
  system: string;
  prompt: string;
  schemaId: string;
  temperature: number;
  seed: number | undefined;
  modelId: string;
}): string {
  const h = createHash("sha256");
  h.update(parts.system);
  h.update("\u0000");
  h.update(parts.prompt);
  h.update("\u0000");
  h.update(parts.schemaId);
  h.update("\u0000");
  h.update(String(parts.temperature));
  h.update("\u0000");
  h.update(parts.seed === undefined ? "" : String(parts.seed));
  h.update("\u0000");
  h.update(parts.modelId);
  return h.digest("hex");
}
