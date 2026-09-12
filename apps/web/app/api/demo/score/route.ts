/**
 * No-signup demo scoring endpoint.
 *
 * Uses the SAME scoring engine as the product (`scoreResume` from
 * @hirelens/core) with the server's configured LLM. Without an LLM key
 * (or on provider failure) it falls back to a deterministic heuristic
 * scorer so the demo always works — the UI labels which mode ran.
 *
 * Rate limiting is in-memory per IP (this is a demo endpoint, not a
 * public API): 20 runs/hour/IP, 400/hour globally. Results are cached
 * per resume so repeat plays are instant and cheap.
 */
import { type ProviderConfig, resolveLanguageModel, scoreResume } from "@hirelens/core";
import { type NextRequest, NextResponse } from "next/server";
import { DEMO_RESUMES, DEMO_RUBRIC } from "@/lib/demo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNS_PER_IP_PER_HOUR = 20;
const RUNS_GLOBAL_PER_HOUR = 400;

interface Bucket {
  count: number;
  resetAt: number;
}
const ipBuckets = new Map<string, Bucket>();
let globalCount = 0;
let globalResetAt = Date.now() + 3_600_000;

const llmCache = new Map<string, unknown>();

function bucketFor(key: string, limit: number): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const bucket = ipBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    ipBuckets.set(key, { count: 1, resetAt: now + 3_600_000 });
    return { allowed: true, resetAt: now + 3_600_000 };
  }
  if (bucket.count >= limit) return { allowed: false, resetAt: bucket.resetAt };
  bucket.count += 1;
  return { allowed: true, resetAt: bucket.resetAt };
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? (forwarded.split(",")[0] ?? "unknown").trim() : "unknown";
}

function readLlmConfig(): ProviderConfig | null {
  const provider = process.env["HIRELENS_LLM_PROVIDER"]?.trim();
  const model = process.env["HIRELENS_LLM_MODEL"]?.trim();
  if (!provider || !model) return null;
  const apiKey = process.env["HIRELENS_LLM_API_KEY"];
  const baseUrl = process.env["HIRELENS_LLM_BASE_URL"];
  return {
    id: provider as ProviderConfig["id"],
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}

/** Deterministic keyword-overlap scorer — the honest no-LLM fallback. */
function heuristicScore(resumeText: string) {
  const text = resumeText.toLowerCase();
  const criteria = DEMO_RUBRIC.criteria.map((c) => {
    const hits = c.key.split("-").flatMap((part) => {
      if (part.length < 4) return [];
      const words = [
        "event",
        "queue",
        "postgres",
        "distributed",
        "consisten",
        "partition",
        "idempoten",
        "retry",
        "kafka",
        "rabbitmq",
        "reliabil",
        "slo",
        "incident",
        "on-call",
        "payment",
        "fintech",
        "ledger",
        "fraud",
        "kubernetes",
        "terraform",
        "docker",
        "exactly-once",
        "migration",
        "shard",
        "replica",
      ];
      return words.filter((w) => text.includes(w));
    });
    const score = Math.min(5, hits.length);
    return {
      key: c.key,
      title: c.title,
      score,
      rationale:
        hits.length === 0
          ? "No matching keywords found for this criterion."
          : `Matched ${hits.length} keyword(s): ${[...new Set(hits)].slice(0, 5).join(", ")}.`,
      evidence: [] as Array<{ quotedText: string; start: number; end: number }>,
    };
  });
  const totalWeight = criteria.reduce((s, c) => {
    const w = DEMO_RUBRIC.criteria.find((x) => x.key === c.key)?.weight ?? 0;
    return s + w;
  }, 0);
  const weighted = criteria.reduce((s, c) => {
    const w = DEMO_RUBRIC.criteria.find((x) => x.key === c.key)?.weight ?? 0;
    return s + (c.score / 5) * w;
  }, 0);
  return {
    mode: "heuristic" as const,
    overall: Math.round((weighted / totalWeight) * 100),
    criteria,
    modelId: "heuristic-v1",
  };
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (globalResetAt <= now) {
    globalCount = 0;
    globalResetAt = now + 3_600_000;
  }
  globalCount += 1;
  if (globalCount > RUNS_GLOBAL_PER_HOUR) {
    return NextResponse.json({ error: "Demo is busy — try again in an hour." }, { status: 429 });
  }

  const ip = clientIp(req);
  const bucket = bucketFor(ip, RUNS_PER_IP_PER_HOUR);
  if (!bucket.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached for this demo (20 runs/hour). Self-host for unlimited use." },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil((bucket.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { resumeId?: unknown };
  const resume = DEMO_RESUMES.find((r) => r.id === body.resumeId);
  if (!resume) {
    return NextResponse.json({ error: "Unknown resume id." }, { status: 400 });
  }

  const cached = llmCache.get(resume.id);
  if (cached) return NextResponse.json(cached);

  const config = readLlmConfig();
  if (config) {
    try {
      const model = resolveLanguageModel(config);
      const result = await scoreResume(model, DEMO_RUBRIC, resume.text);
      const payload = {
        mode: "llm" as const,
        overall: result.overall,
        modelId: result.modelId,
        criteria: result.criteria.map((c) => ({
          key: c.key,
          title: DEMO_RUBRIC.criteria.find((x) => x.key === c.key)?.title ?? c.key,
          score: c.score,
          rationale: c.rationale,
          evidence: c.evidence
            ? [
                {
                  quotedText: c.evidence.quotedText,
                  start: c.evidence.startOffset,
                  end: c.evidence.endOffset,
                },
              ]
            : [],
        })),
      };
      llmCache.set(resume.id, payload);
      return NextResponse.json(payload);
    } catch {
      // Fall through to heuristic — the demo must never 500 on a flaky key.
    }
  }

  const payload = heuristicScore(resume.text);
  return NextResponse.json(payload);
}
