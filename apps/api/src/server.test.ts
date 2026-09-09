import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The health route, extracted for testing. server.ts wires it to a real port.
const HealthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

function buildApp(): Hono {
  const app = new Hono();
  app.get("/api/health", (c) =>
    c.json(HealthSchema.parse({ ok: true as const, service: "hirelens-api", version: "0.1.0" })),
  );
  return app;
}

describe("GET /api/health", () => {
  it("returns a schema-valid health payload", async () => {
    const res = await buildApp().request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(HealthSchema.parse(body)).toMatchObject({ ok: true, service: "hirelens-api" });
  });
});
