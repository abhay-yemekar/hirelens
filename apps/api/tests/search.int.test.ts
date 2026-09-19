/**
 * Semantic search + Ask integration tests (no embeddings configured →
 * keyword fallback paths; the LLM is the captured mock model). Skips
 * unless DATABASE_URL is set.
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
let appNoLlm: ReturnType<typeof createApp>;
let authHeaders: Record<string, string>;
let orgId = "";

const STAMP = Date.now();

const RESUME = [
  "JORDAN AVERY",
  "Senior Backend Engineer - jordan.avery@example.com",
  "",
  "EXPERIENCE",
  "Senior Backend Engineer - Acme Corp - 2021 - Present",
  "- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.",
  "",
  "SKILLS",
  "TypeScript, Node.js, PostgreSQL, Kubernetes",
].join("\n");

beforeAll(async () => {
  if (!available) return;
  const db = createDb(DATABASE_URL);
  // The Ask route's LLM returns a canned AskSchema answer.
  const { model } = createMockModel({
    args: {
      answer: "Jordan Avery led the payments platform migration to Kubernetes.",
      usedChunkIds: [],
      confidence: "medium",
    },
  });
  app = createApp({ db, llm: model as never });
  appNoLlm = createApp({ db, llm: null });

  const signUp = await auth.api.signUpEmail({
    body: {
      name: "Search Tester",
      email: `search-${STAMP}@example.com`,
      password: "Str0ng-Passw0rd!123",
    },
    returnHeaders: true,
  });
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  authHeaders = { cookie };
  const org = await auth.api.createOrganization({
    body: { name: "Search Org", slug: `search-${STAMP}` },
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

describe.skipIf(!available && allowSkip)("search & ask", () => {
  it("ranks candidates by keyword when no embeddings are configured", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Search Job", description: "Search test job." }),
    });
    expect(jobRes.status).toBe(201);
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    const up = await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    expect(up.status).toBe(201);

    const res = await app.request(
      `/api/jobs/${job.id}/search?q=${encodeURIComponent("kubernetes")}`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      mode: string;
      hits: Array<{ candidateId: string; label: string | null; score: number }>;
      indexed: number;
      total: number;
    };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("keyword");
    expect(body.total).toBe(1);
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]?.label).toBe("jordan");
    expect(body.hits[0]!.score).toBeGreaterThan(0);

    // No indexer configured → backfill explains what to set.
    const idx = await app.request(`/api/jobs/${job.id}/index`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(idx.status).toBe(503);
    const idxBody = (await idx.json()) as { error: string };
    expect(idxBody.error).toBe("embedding_not_configured");
  });

  it("answers a question with citations verified against retrieved chunks", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Ask Job", description: "Ask test job." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };

    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });

    const res = await app.request(`/api/jobs/${job.id}/ask`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ question: "Who has Kubernetes migration experience?" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      answer: string | null;
      confidence: string;
      citations: Array<{ chunkId: string; candidateId: string; label: string | null }>;
    };
    expect(body.ok).toBe(true);
    expect(body.answer).toContain("Kubernetes");
    expect(body.confidence).toBe("medium");
    // The mock cites [] → verified citations must also be [] (no invention).
    expect(body.citations).toEqual([]);

    // Ask without an LLM configured → clean 503, not a crash.
    const noLlm = await appNoLlm.request(`/api/jobs/${job.id}/ask`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ question: "Who knows PostgreSQL?" }),
    });
    expect(noLlm.status).toBe(503);
  });

  it("masks labels in blind mode and rejects short queries", async () => {
    const jobRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Blind Search Job", description: "Blind test." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };
    const form = new FormData();
    form.append("file", new File([RESUME], "jordan.txt", { type: "text/plain" }));
    await app.request(`/api/jobs/${job.id}/candidates`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });

    const res = await app.request(
      `/api/jobs/${job.id}/search?q=${encodeURIComponent("kubernetes")}&blind=1`,
      { headers: authHeaders },
    );
    const body = (await res.json()) as {
      hits: Array<{ label: string | null }>;
    };
    expect(body.hits[0]?.label).toBeNull();

    const short = await app.request(`/api/jobs/${job.id}/search?q=k`, {
      headers: authHeaders,
    });
    expect(short.status).toBe(400);
  });
});
