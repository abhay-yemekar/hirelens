/**
 * Semantic search + Ask integration tests (no embeddings configured →
 * keyword fallback paths; the LLM is the captured mock model). Skips
 * unless DATABASE_URL is set.
 */

import { createMockModel, type EmbeddingModel } from "@candidlens/core";
import { auth, createDb, organization } from "@candidlens/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createIndexer } from "../src/indexing.js";
import { deleteOrgCompletely } from "./helpers.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const available = DATABASE_URL.length > 0;
const allowSkip = !process.env["CI"];

let app: ReturnType<typeof createApp>;
let appNoLlm: ReturnType<typeof createApp>;
let appSemantic: ReturnType<typeof createApp>;
/** Every prompt the Ask route's mock LLM received. */
let llmCalls: Array<{ prompt: string }> = [];

/**
 * A stand-in for gemini-embedding-2: one dimension per topic, so a query
 * about container orchestration lands on the Kubernetes resume although
 * it shares no word with it. Every text also shares one "resume" dimension,
 * so unrelated text sits at cosine distance 0.29, not far apart, as with
 * the real model. Records every text it was asked to embed.
 */
const embeddedTexts: string[] = [];
const TOPICS = [/kubernetes|orchestration|container/i, /pastry|bakery|dessert/i];
const topicEmbedder = {
  specificationVersion: "v4",
  provider: "test",
  modelId: "topic-embedder",
  maxEmbeddingsPerCall: 100,
  supportsParallelCalls: true,
  doEmbed: async ({ values }: { values: string[] }) => {
    embeddedTexts.push(...values);
    return {
      embeddings: values.map((text) => {
        const v = Array.from({ length: 768 }, () => 0);
        TOPICS.forEach((topic, i) => {
          if (topic.test(text)) v[i] = 1;
        });
        v[767] = 1;
        return v;
      }),
      warnings: [],
    };
  },
} as unknown as EmbeddingModel;

const BAKER_RESUME = [
  "SAM BAKER",
  "Pastry Chef - sam.baker@example.com",
  "",
  "EXPERIENCE",
  "Head Pastry Chef - Crumb & Co Bakery - 2019 - Present",
  "- Designed seasonal dessert menus and trained junior bakers.",
].join("\n");
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
  const { model, calls } = createMockModel({
    args: {
      answer: "Jordan Avery led the payments platform migration to Kubernetes.",
      usedChunkIds: [],
      confidence: "medium",
    },
  });
  llmCalls = calls;
  app = createApp({ db, llm: model as never });
  appNoLlm = createApp({ db, llm: null });
  appSemantic = createApp({ db, llm: model as never, indexer: createIndexer(db, topicEmbedder) });

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
  await deleteOrgCompletely(createDb(DATABASE_URL), orgId);
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
    // A number: the web app shows its Index button when `indexed === 0`.
    expect(body.indexed).toBe(0);
    expect(body.total).toBe(1);
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]?.label).toBe("jordan");
    expect(body.hits[0]?.score).toBeGreaterThan(0);

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

  it("searches by meaning once resumes are embedded", async () => {
    const jobRes = await appSemantic.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Semantic Job", description: "Semantic test." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };
    for (const [name, text] of [
      ["jordan.txt", RESUME],
      ["baker.txt", BAKER_RESUME],
    ] as const) {
      const form = new FormData();
      form.append("file", new File([text], name, { type: "text/plain" }));
      const up = await appSemantic.request(`/api/jobs/${job.id}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(up.status).toBe(201);
    }
    // Upload indexed each resume as an untitled document.
    expect(embeddedTexts.filter((t) => t.startsWith("title: none | text: "))).toHaveLength(2);

    // No word of the query is in either resume: only meaning can find Jordan.
    const res = await appSemantic.request(
      `/api/jobs/${job.id}/search?q=${encodeURIComponent("container orchestration")}`,
      { headers: authHeaders },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      embeddingModel: string | null;
      indexed: number;
      total: number;
      hits: Array<{ label: string | null }>;
    };
    expect(body.mode).toBe("semantic+keyword");
    expect(body.embeddingModel).toBe("google/gemini-embedding-2");
    expect(body.indexed).toBe(2);
    expect(body.total).toBe(2);
    expect(body.hits.map((h) => h.label)).toEqual(["jordan"]);
    expect(embeddedTexts).toContain("task: search result | query: container orchestration");

    // Nothing stands out for an unrelated query, although both resumes are
    // within the old 0.85 distance cut-off.
    const unrelated = await appSemantic.request(
      `/api/jobs/${job.id}/search?q=${encodeURIComponent("piano lessons")}`,
      { headers: authHeaders },
    );
    const unrelatedBody = (await unrelated.json()) as { mode: string; hits: unknown[] };
    expect(unrelatedBody.hits).toEqual([]);
    expect(unrelatedBody.mode).toBe("keyword");

    // Ask embeds its question as one, and the model sees only the resume
    // that matches by meaning.
    const ask = await appSemantic.request(`/api/jobs/${job.id}/ask`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ question: "Who runs container orchestration?" }),
    });
    expect(ask.status).toBe(200);
    expect(embeddedTexts).toContain(
      "task: question answering | query: Who runs container orchestration?",
    );
    const askPrompt = llmCalls.at(-1)?.prompt ?? "";
    expect(askPrompt).toContain("Kubernetes");
    expect(askPrompt).not.toContain("Pastry");

    // The Index button re-embeds every resume in the job.
    const idx = await appSemantic.request(`/api/jobs/${job.id}/index`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(idx.status).toBe(200);
    expect(await idx.json()).toEqual({ ok: true, indexed: 2, total: 2 });
  });

  it("offers indexing for a partly indexed job only where it can work", async () => {
    const jobRes = await appSemantic.request("/api/jobs", {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Partly indexed job", description: "Backfill test." }),
    });
    const { job } = (await jobRes.json()) as { job: { id: string } };
    // One resume arrives while the server can't embed, one after.
    for (const [server, name, text] of [
      [app, "jordan.txt", RESUME],
      [appSemantic, "baker.txt", BAKER_RESUME],
    ] as const) {
      const form = new FormData();
      form.append("file", new File([text], name, { type: "text/plain" }));
      const up = await server.request(`/api/jobs/${job.id}/candidates`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      expect(up.status).toBe(201);
    }

    type Status = { indexed: number; total: number; indexingEnabled: boolean };
    const status = async (server: typeof app): Promise<Status> =>
      (await (
        await server.request(`/api/jobs/${job.id}/search?q=${encodeURIComponent("experience")}`, {
          headers: authHeaders,
        })
      ).json()) as Status;

    expect(await status(appSemantic)).toMatchObject({
      indexed: 1,
      total: 2,
      indexingEnabled: true,
    });
    // Without an embedding model the button would only fail, so it is off.
    expect(await status(app)).toMatchObject({ indexed: 1, total: 2, indexingEnabled: false });

    const idx = await appSemantic.request(`/api/jobs/${job.id}/index`, {
      method: "POST",
      headers: authHeaders,
    });
    expect(await idx.json()).toEqual({ ok: true, indexed: 2, total: 2 });
    expect(await status(appSemantic)).toMatchObject({ indexed: 2, total: 2 });
  });
});
