import type { Context } from "hono";

/**
 * Parse a JSON request body, returning null instead of throwing on
 * malformed or empty input so routes can respond 400 invalid_body
 * rather than leaking a 500.
 */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
