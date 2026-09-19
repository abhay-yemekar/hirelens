import { createDb } from "@hirelens/db";
import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadEnv, readLlmEnv } from "./env.js";
import { createIndexer, embeddingModelFromEnv } from "./indexing.js";
import { modelFromEnv } from "./model.js";
import { flushSentry, initSentry } from "./observability.js";

initSentry();

const env = loadEnv();
const database = createDb(env.DATABASE_URL);
const embedding = embeddingModelFromEnv(process.env);
const app = createApp({
  db: database,
  llm: modelFromEnv(readLlmEnv()),
  indexer: embedding ? createIndexer(database, embedding) : null,
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`HireLens API listening on http://localhost:${info.port}`);
});

async function shutdown(): Promise<void> {
  server.close(() => {
    void flushSentry().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
