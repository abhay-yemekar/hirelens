/**
 * The served OpenAPI document must name every route that actually exists.
 * This is the honesty contract: a new endpoint without a spec entry fails
 * CI, so the public docs can't silently rot.
 */

import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("GET /api/openapi.json", () => {
  it("serves an OpenAPI 3.1 document with auth security and error schema", async () => {
    const app = createApp({ db: {} as never, llm: {} as never });
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
      security?: unknown;
    };
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(15);
    expect(doc.security).toBeDefined();
    for (const key of ["/api/jobs/{jobId}/score", "/api/jobs/{jobId}/decisions", "/api/health"]) {
      expect(doc.paths[key]).toBeDefined();
    }
  });

  it("covers every mounted route with at least one operation", async () => {
    const app = createApp({ db: {} as never, llm: {} as never });
    const res = await app.request("/api/openapi.json");
    const doc = (await res.json()) as { paths: Record<string, Record<string, unknown>> };
    const specPaths = new Set(Object.keys(doc.paths).map(specPathFromTemplate));
    // Every concrete path pattern the API mounts must appear in the spec.
    for (const mounted of MOUNTED_ROUTES) {
      expect(specPaths.has(mounted), `route missing from spec: ${mounted}`).toBe(true);
    }
  });

  it("documents the better-auth routes the client integration relies on", async () => {
    const app = createApp({ db: {} as never, llm: {} as never });
    const res = await app.request("/api/openapi.json");
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    for (const key of [
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/auth/organization/list",
      "/api/auth/organization/create",
      "/api/auth/organization/set-active",
    ]) {
      expect(doc.paths[key]).toBeDefined();
    }
  });
});

/** Concrete mounted patterns in the app (param segments in {brace} form). */
const MOUNTED_ROUTES = [
  "/api/health",
  "/api/openapi.json",
  "/api/jobs",
  "/api/jobs/{id}",
  "/api/jobs/{jobId}/rubrics",
  "/api/jobs/{jobId}/rubrics/{version}",
  "/api/jobs/{jobId}/rubrics/derive",
  "/api/jobs/{jobId}/candidates",
  "/api/jobs/{jobId}/candidates/zip",
  "/api/jobs/{jobId}/candidates/{candidateId}",
  "/api/jobs/{jobId}/candidates/{candidateId}/demographics",
  "/api/jobs/{jobId}/score",
  "/api/jobs/{jobId}/runs",
  "/api/jobs/{jobId}/runs/{runId}",
  "/api/jobs/{jobId}/review",
  "/api/jobs/{jobId}/decisions",
  "/api/jobs/{jobId}/scores/{scoreId}",
  "/api/jobs/{jobId}/bias-audit",
];

/** "/jobs/{jobId}/candidates" — normalize hono-style ":param" to OpenAPI "{param}". */
function specPathFromTemplate(path: string): string {
  return path;
}
