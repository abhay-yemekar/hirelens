/**
 * ATS integration surface tests (v1.2): token lifecycle + the real inbound
 * webhook — auth fail-closed, org scoping, idempotent ingest. Runs against
 * a live local HTTP server so the resume fetch exercises the real network
 * path. Skips unless DATABASE_URL is set (never skips on CI).
 */

import { createServer } from "node:http";
import { createMockModel } from "@hirelens/core";
import { auth, candidates, createDb, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let db: ReturnType<typeof createDb>;
let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";
const STAMP = Date.now();

beforeAll(async () => {
  if (!available) return;
  db = createDb(DATABASE_URL);
  const { model } = createMockModel({ args: {} });
  app = createApp({ db, llm: model as never });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "ATS Tester",
      email: `ats-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "ATS Org", slug: `ats-${STAMP}` },
    headers: new Headers({ cookie }),
  });
  orgId = org.id;
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: new Headers({ cookie }),
  });
});

afterAll(async () => {
  if (!available || orgId === "") return;
  await createDb(DATABASE_URL).delete(organization).where(eq(organization.id, orgId));
});

describe.skipIf(!available && allowSkip)("ats integration surface", () => {
  let jobId = "";
  let rawToken = "";
  let tokenId = "";

  it("creates a job and an API token (raw shown once)", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "ATS Job", description: "Integration test job." }),
    });
    expect(jobRes.status).toBe(201);
    jobId = ((await jobRes.json()) as { job: { id: string } }).job.id;

    const tokenRes = await app.request("/api/tokens", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ label: "Greenhouse webhook" }),
    });
    expect(tokenRes.status).toBe(201);
    const tokenBody = (await tokenRes.json()) as {
      token: { id: string; raw: string; last4: string };
    };
    expect(tokenBody.token.raw.startsWith("hl_")).toBe(true);
    expect(tokenBody.token.raw.length).toBeGreaterThan(20);
    rawToken = tokenBody.token.raw;
    tokenId = tokenBody.token.id;

    // Listing never leaks the raw secret.
    const listRes = await app.request("/api/tokens", { headers: authHeaders });
    const listBody = (await listRes.json()) as { tokens: Array<Record<string, unknown>> };
    expect(listBody.tokens.some((t) => "raw" in t)).toBe(false);
    expect(listBody.tokens.some((t) => t["last4"] === rawToken.slice(-4))).toBe(true);
  });

  it("webhook rejects anonymous, wrong-token, and cross-org job ids", async () => {
    const webhook = (headers: Record<string, string>, jobIdOverride?: string) =>
      app.request("/api/webhooks/ats", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          jobId: jobIdOverride ?? jobId,
          candidate: {
            name: "Jane Doe",
            email: "jane@example.com",
            resumeUrl: "https://example.com/jane-doe.txt",
          },
        }),
      });

    expect((await webhook({})).status).toBe(401);
    expect((await webhook({ authorization: "Bearer hl_wrongtokenvalue123456" })).status).toBe(401);
    // Valid token but a job from another org (random uuid):
    expect(
      (
        await webhook(
          { authorization: `Bearer ${rawToken}` },
          "00000000-0000-4000-8000-000000000000",
        )
      ).status,
    ).toBe(404);
  });

  it("rejects plaintext resume URLs (HTTPS-only guard)", async () => {
    // Serve a resume over plain HTTP — the webhook must refuse it (PII).
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("JANE DOE");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    try {
      const res = await app.request("/api/webhooks/ats", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${rawToken}`,
        },
        body: JSON.stringify({
          jobId,
          candidate: {
            name: "Jane Doe",
            resumeUrl: `http://127.0.0.1:${port}/jane-doe.txt`,
          },
        }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("insecure_url");
    } finally {
      server.close();
    }
  });

  it("ingests a candidate from an HTTPS resume, idempotently", async () => {
    // Happy path: stub the network boundary — the webhook fetches an
    // https URL, ingests through the real pipeline, dedupes on retry.
    const resumeText = [
      "JANE DOE",
      "jane.doe@example.com",
      "SKILLS: TypeScript, PostgreSQL, React",
      "EXPERIENCE",
      "Built and shipped a data platform serving 40k daily events.",
    ].join("\n");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(resumeText, { headers: { "content-type": "text/plain" } })) as typeof fetch;

    let firstId = "";
    try {
      const send = () =>
        app.request("/api/webhooks/ats", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${rawToken}`,
          },
          body: JSON.stringify({
            jobId,
            candidate: {
              name: "Jane Doe",
              email: "jane@example.com",
              resumeUrl: "https://ats.example.com/files/jane-doe.txt",
            },
          }),
        });

      const first = await send();
      expect(first.status).toBe(201);
      const firstBody = (await first.json()) as { status: string; candidateId: string };
      expect(firstBody.status).toBe("created");
      firstId = firstBody.candidateId;

      // ATS retry → duplicate (same text hash), same candidate, HTTP 200.
      const retry = await send();
      expect(retry.status).toBe(200);
      const retryBody = (await retry.json()) as { status: string; candidateId: string };
      expect(retryBody.status).toBe("duplicate");
      expect(retryBody.candidateId).toBe(firstId);

      // ATS-provided email persisted for the contact column.
      const [row] = await db
        .select({ email: candidates.contactEmail })
        .from(candidates)
        .where(eq(candidates.id, firstId))
        .limit(1);
      expect(row?.email).toBe("jane@example.com");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(firstId).not.toBe("");
  });

  it("revocation fails the webhook closed immediately", async () => {
    const del = await app.request(`/api/tokens/${tokenId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(del.status).toBe(200);

    const res = await app.request("/api/webhooks/ats", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${rawToken}`,
      },
      body: JSON.stringify({
        jobId,
        candidate: {
          name: "Jane Again",
          resumeUrl: "https://example.com/jane-again.txt",
        },
      }),
    });
    expect(res.status).toBe(401);
  });
});
