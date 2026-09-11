import { createDb } from "@hirelens/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv, readLlmEnv } from "./env.js";
import { modelFromEnv } from "./model.js";

const env = loadEnv();
const app = createApp({
  db: createDb(env.DATABASE_URL),
  llm: modelFromEnv(readLlmEnv()),
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
