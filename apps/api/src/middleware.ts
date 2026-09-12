import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { logger } from "./observability.js";

/** X-Request-ID (or generated) attached to every request + response. */
export function requestLogging(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);

    const start = Date.now();
    await next();
    const ms = Date.now() - start;

    // Skip health-check noise at info level.
    if (c.req.path === "/api/health") return;
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms,
      },
      "http.request",
    );
  };
}
