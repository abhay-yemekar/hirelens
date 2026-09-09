import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(4000),
});

const env = EnvSchema.parse(process.env);

const app = new Hono();

const HealthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

app.get("/api/health", (c) => {
  const body = HealthSchema.parse({
    ok: true as const,
    service: "hirelens-api",
    version: "0.1.0",
  });
  return c.json(body);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`HireLens API listening on http://localhost:${info.port}`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
