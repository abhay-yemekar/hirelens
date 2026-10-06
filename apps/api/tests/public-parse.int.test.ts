/**
 * Public parser API integration tests (v1.4): token-gated stateless
 * parsing — auth failures, both input shapes (JSON text + multipart file),
 * deterministic content hash, parse failures, size caps, and the per-token
 * rate limit. Skips unless DATABASE_URL is set (never skips on CI).
 */

import { createMockModel } from "@hirelens/core";
import { auth, createDb, organization } from "@hirelens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let app: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();

const RESUME_TEXT = [
  "Priya Sharma",
  "Email: priya.sharma@example.com | Phone: +1 415 555 0199",
  "",
  "SKILLS",
  "Kafka, PostgreSQL, Kubernetes",
  "",
  "EXPERIENCE",
  "Backend Engineer - Example Corp - 2022 - Present",
  "- Built streaming pipelines in Go.",
].join("\n");

async function parse(token: string | null, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return app.request("/api/public/parse", { ...init, headers });
}

beforeAll(async () => {
  if (!available) return;
  app = createApp({
    db: createDb(DATABASE_URL),
    llm: createMockModel({ args: { criteria: [] } }).model as never,
  });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Parse Tester",
      email: `parse-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Parse Org", slug: `parse-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("public parser API", () => {
  let token = "";

  it("mints an org API token for the suite", async () => {
    const res = await app.request("/api/tokens", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ label: "parser suite" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: { raw: string } };
    token = body.token.raw;
    expect(token.startsWith("hl_")).toBe(true);
  });

  it("rejects missing and invalid tokens with 401", async () => {
    const none = await parse(null, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: RESUME_TEXT }),
    });
    expect(none.status).toBe(401);

    const bad = await parse("hl_not-a-real-token-value", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: RESUME_TEXT }),
    });
    expect(bad.status).toBe(401);
  });

  it("parses raw text into the JSON-Resume-compatible profile", async () => {
    const res = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: RESUME_TEXT }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      parsed: {
        name: string | null;
        email: string | null;
        skills: string[];
        language: string | null;
      };
      contentHash: string;
      kind: string;
      pageCount: number;
      warnings: string[];
      formatCheck: { verdict: string; score: number; findings: Array<{ code: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.parsed.name?.toLowerCase()).toContain("priya");
    expect(body.parsed.email).toBe("priya.sharma@example.com");
    expect(body.parsed.skills.map((s) => s.toLowerCase())).toContain("kafka");
    expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.kind).toBe("txt");
    expect(body.pageCount).toBe(1);
    // ATS format check (v1.4): clean resume parses as pass with full score.
    expect(body.formatCheck.verdict).toBe("pass");
    expect(body.formatCheck.score).toBe(100);
    expect(body.formatCheck.findings).toEqual([]);
  });

  it("returns a warning formatCheck for a resume missing skills and phone", async () => {
    const res = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: [
          "Priya Sharma",
          "Email: priya.sharma@example.com",
          "",
          "EXPERIENCE",
          "Backend Engineer - Example Corp - 2022 - Present",
          "- Built streaming pipelines in Go.",
          "- Owned ingestion and processing layers.",
          "- Tuned streaming throughput end to end.",
        ].join("\n"),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      formatCheck: { verdict: string; score: number; findings: Array<{ code: string }> };
    };
    expect(body.formatCheck.verdict).toBe("warn");
    expect(body.formatCheck.findings.some((f) => f.code === "no-skills")).toBe(true);
    expect(body.formatCheck.findings.some((f) => f.code === "no-phone")).toBe(true);
  });

  it("keeps table-layout findings in formatCheck for pipe-delimited resumes", async () => {
    const res = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: [
          "Jordan Avery",
          "jordan@example.com | 555-0142",
          "",
          "EXPERIENCE",
          "Engineer | Acme | 2020 | 2024",
          "Engineer | Globex | 2018 | 2020",
          "Manager | Initech | 2016 | 2018",
          "Associate | Umbrella | 2014 | 2016",
          "Intern | Cyberdyne | 2013 | 2014",
          "",
          "SKILLS",
          "TypeScript, Docker, Kubernetes, SQL, React, Git, CI/CD, Jest",
        ].join("\n"),
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      formatCheck: { verdict: string; findings: Array<{ code: string }> };
    };
    expect(body.formatCheck.findings.some((f) => f.code === "table-layout")).toBe(true);
  });

  it("parses a multipart upload and hashes identical content identically", async () => {
    const form = new FormData();
    form.append("file", new File([RESUME_TEXT], "priya-sharma.txt", { type: "text/plain" }));
    const res = await parse(token, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contentHash: string; parsed: { email: string | null } };

    // Determinism: same content via JSON text must produce the same hash.
    const res2 = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: RESUME_TEXT }),
    });
    const body2 = (await res2.json()) as { contentHash: string };
    expect(body.contentHash).toBe(body2.contentHash);
    expect(body.parsed.email).toBe("priya.sharma@example.com");
  });

  it("rejects wrong content type, oversized text, and low-information text", async () => {
    const wrongType = await parse(token, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: RESUME_TEXT,
    });
    expect(wrongType.status).toBe(415);

    const huge = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(200_001) }),
    });
    expect(huge.status).toBe(413);

    const lowInfo = await parse(token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "lorem ipsum dolor sit amet\nconsectetur adipiscing elit" }),
    });
    expect(lowInfo.status).toBe(422);
    const lowBody = (await lowInfo.json()) as { error: string };
    expect(lowBody.error).toBe("low_information");
  });

  it("returns 422 for a multipart file with no extractable text", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(0)], "empty.txt", { type: "text/plain" }));
    const res = await parse(token, { method: "POST", body: form });
    expect(res.status).toBe(422);
  });

  it("rate limits per token (429 + Retry-After)", async () => {
    process.env["HIRELENS_PARSE_RATE_LIMIT"] = "2";
    try {
      // Mint a fresh token so this test's bucket starts empty.
      const mint = await app.request("/api/tokens", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ label: "rate limit test" }),
      });
      const minted = (await mint.json()) as { token: { raw: string } };

      const first = await parse(minted.token.raw, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: RESUME_TEXT }),
      });
      expect(first.status).toBe(200);
      const second = await parse(minted.token.raw, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: RESUME_TEXT }),
      });
      expect(second.status).toBe(200);
      const third = await parse(minted.token.raw, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: RESUME_TEXT }),
      });
      expect(third.status).toBe(429);
      expect(third.headers.get("retry-after")).toBeTruthy();

      // A different token has its own (empty) bucket.
      const mint2 = await app.request("/api/tokens", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ label: "rate limit isolation" }),
      });
      const minted2 = (await mint2.json()) as { token: { raw: string } };
      const other = await parse(minted2.token.raw, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: RESUME_TEXT }),
      });
      expect(other.status).toBe(200);
    } finally {
      delete process.env["HIRELENS_PARSE_RATE_LIMIT"];
    }
  });

  it("rejects revoked tokens", async () => {
    const mint = await app.request("/api/tokens", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ label: "revoke test" }),
    });
    const minted = (await mint.json()) as { token: { raw: string; id: string } };

    const revoke = await app.request(`/api/tokens/${minted.token.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(revoke.status).toBe(200);

    const after = await parse(minted.token.raw, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: RESUME_TEXT }),
    });
    expect(after.status).toBe(401);
  });
});
