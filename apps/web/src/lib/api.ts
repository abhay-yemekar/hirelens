"use client";

import { API_URL } from "./env";

export interface ApiError {
  ok: false;
  error: string;
  message?: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiError) {
    super(body.message ?? body.error);
    this.status = status;
    this.code = body.error;
  }
}

function _authHeaders(cookieHeader: string | null): HeadersInit {
  return cookieHeader ? { cookie: cookieHeader } : {};
}

/**
 * Call the HireLens API. In the browser, credentials are sent automatically
 * (same-site cookies). On the server, pass the incoming request's cookie
 * header via the `serverCookie` option so auth round-trips.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { serverCookie?: string | null } = {},
): Promise<T> {
  const { serverCookie, headers, ...rest } = init;

  // Normalize any HeadersInit shape through Headers, then merge.
  const h = new Headers(headers ?? undefined);
  if (serverCookie) h.set("cookie", serverCookie);

  const finalHeaders: Record<string, string> = {};
  h.forEach((value, key) => {
    finalHeaders[key] = value;
  });

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: finalHeaders,
  });

  const body: unknown = await res.json().catch(() => ({ ok: false, error: "bad_response" }));
  if (!res.ok) {
    throw new ApiRequestError(res.status, body as ApiError);
  }
  return body as T;
}

export function serverCookieInit(cookieHeader: string | null): { serverCookie: string | null } {
  return { serverCookie: cookieHeader };
}

// ---------- endpoint helpers ----------

export interface Job {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: "draft" | "open" | "closed";
  createdAt: string;
}

export interface RubricVersion {
  id: string;
  version: number;
  createdAt: string;
}

export interface CandidateRow {
  id: string;
  language: string | null;
  sourceFileKey: string | null;
  createdAt: string;
  pageCount: number | null;
}

export interface RunRow {
  id: string;
  rubricVersion: number;
  modelId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
}

export interface EvidenceSpan {
  scoreId: string;
  documentId: string;
  startOffset: number;
  endOffset: number;
  quotedText: string;
}

export interface RunCandidate {
  candidateId: string;
  overall: number;
  criteria: Array<{
    id: string;
    criterionKey: string;
    score: number;
    confidence: number | null;
    rationale: string | null;
    evidence: EvidenceSpan[];
  }>;
}

export interface RunDetail {
  run: RunRow;
  candidates: RunCandidate[];
}

export const listJobs = (init?: RequestInit & { serverCookie?: string | null }) =>
  apiFetch<{ ok: true; jobs: Job[] }>("/api/jobs", { ...init });

export const getJob = (jobId: string, init?: RequestInit & { serverCookie?: string | null }) =>
  apiFetch<{ ok: true; job: Job }>(`/api/jobs/${jobId}`, { ...init });

export const createJob = (
  body: { title: string; description: string },
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{ ok: true; job: Job }>("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });

export const listRubrics = (jobId: string, init?: RequestInit & { serverCookie?: string | null }) =>
  apiFetch<{ ok: true; rubrics: RubricVersion[] }>(`/api/jobs/${jobId}/rubrics`, { ...init });

export const listCandidates = (
  jobId: string,
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{ ok: true; candidates: CandidateRow[] }>(`/api/jobs/${jobId}/candidates`, { ...init });

export const listRuns = (jobId: string, init?: RequestInit & { serverCookie?: string | null }) =>
  apiFetch<{ ok: true; runs: RunRow[] }>(`/api/jobs/${jobId}/runs`, { ...init });

export const getRun = (
  jobId: string,
  runId: string,
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{ ok: true; run: RunRow; candidates: RunCandidate[] }>(
    `/api/jobs/${jobId}/runs/${runId}`,
    { ...init },
  );

export const getCandidate = (
  jobId: string,
  candidateId: string,
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{
    ok: true;
    candidate: { id: string };
    documents: Array<{ id: string; kind: string; rawText: string; pageCount: number | null }>;
    decisions: Array<{ stage: string; reason: string; decidedAt: string }>;
  }>(`/api/jobs/${jobId}/candidates/${candidateId}`, { ...init });

export const importRubric = (
  jobId: string,
  rubric: unknown,
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{ ok: true; rubric: { version: number } }>(`/api/jobs/${jobId}/rubrics`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rubric }),
    ...init,
  });

export const kickoffScore = (
  jobId: string,
  init?: RequestInit & { serverCookie?: string | null },
) =>
  apiFetch<{ ok: true; summary: { runId: string; total: number; scored: number; failed: number } }>(
    `/api/jobs/${jobId}/score`,
    { method: "POST", ...init },
  );
