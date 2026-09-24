/**
 * Score-my-resume (v1.1) — the candidate-side funnel.
 *
 * A public endpoint where a job seeker pastes their resume (or uploads
 * PDF/DOCX/TXT) plus a job description and gets an instant, evidence-linked
 * score from the SAME engine the recruiters use. Nothing is persisted:
 * the text lives in the request, the score in the response — no account,
 * no database row, no email captured. The privacy story is the feature:
 * "your resume never leaves this request".
 *
 * Rate limits mirror the demo endpoint (in-memory per IP, 10/hour/IP,
 * 120/hour globally) so a public LLM-backed endpoint can't be abused.
 * The rubric is derived from the pasted JD by the LLM when available
 * (single call), falling back to a generic criteria set otherwise.
 */

import type { Criterion, Rubric } from "@hirelens/core";
import {
  ExtractionError,
  extractDocument,
  isSupportedExtension,
  MAX_DOCUMENT_BYTES,
  matchPct,
  type ProviderConfig,
  parseCandidate,
  resolveLanguageModel,
  scoreResume,
  skillGraph,
  skillsInText,
  sniffKind,
} from "@hirelens/core";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNS_PER_IP_PER_HOUR = 10;
const RUNS_GLOBAL_PER_HOUR = 120;
const MAX_TEXT_CHARS = 60_000;
const MAX_JD_CHARS = 20_000;

interface Bucket {
  count: number;
  resetAt: number;
}
const ipBuckets = new Map<string, Bucket>();
let globalCount = 0;
let globalResetAt = Date.now() + 3_600_000;

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

interface WeakCriterion {
  title: string;
  score: number;
  evidence: string[];
}

/** Plain-language improvement steps, weakest criterion first (v1.2). */
function improvementSteps(
  criteria: Array<{ title: string; score: number | null; evidence: string[] }>,
  missingSkills: string[],
): string[] {
  const steps: string[] = [];
  const weak = criteria
    .filter((c) => c.score !== null && c.score <= 2)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  for (const w of weak.slice(0, 3) as WeakCriterion[]) {
    steps.push(
      `Strengthen "${w.title}" — scored ${w.score}/5. Add one concrete example with a measurable outcome.`,
    );
  }
  if (missingSkills.length > 0) {
    const list = missingSkills.slice(0, 4).join(", ");
    steps.push(
      `The job mentions ${list} but your resume doesn't reference ${missingSkills.length > 1 ? "them" : "it"} — if you have real experience, name it explicitly; otherwise treat it as a learning goal.`,
    );
  }
  if (steps.length === 0) {
    steps.push("Solid across the board — keep the specific, measurable examples front and center.");
  }
  return steps.slice(0, 5);
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

/** Anchored 0–5 scale shared by every derived criterion. */
function genericScale(title: string): Criterion["scale"] {
  const t = title.trim().toLowerCase() || "this criterion";
  return [
    { label: "0 — None", description: `No evidence of ${t} in the resume.` },
    { label: "1 — Faint", description: `Barely mentions anything related to ${t}.` },
    {
      label: "2 — Some",
      description: `Some exposure to ${t}: coursework, brief use, or a single project.`,
    },
    { label: "3 — Solid", description: `Clear working experience with ${t}.` },
    {
      label: "4 — Strong",
      description: `Substantial, repeated experience; led work involving ${t}.`,
    },
    { label: "5 — Expert", description: `Deep expertise with measurable impact in ${t}.` },
  ];
}

/**
 * Derive 5 criteria from the JD with one LLM call; fall back to a fixed,
 * honest criteria set (labeled as generic) when no LLM is configured.
 */
async function deriveCriteria(
  model: ReturnType<typeof resolveLanguageModel> | null,
  jd: string,
): Promise<{ criteria: Criterion[]; derivedBy: "llm" | "generic" }> {
  if (model) {
    try {
      // Reuse the derive prompt indirectly: a compact JSON instruction keeps
      // this to one fast call. Parsed strictly; any shape problem falls back.
      const { generateObject } = await import("ai");
      const { z } = await import("zod");
      const schema = z.object({
        criteria: z
          .array(z.object({ key: z.string(), title: z.string(), weight: z.number() }))
          .min(5)
          .max(8),
      });
      const { object } = await generateObject({
        model,
        schema,
        prompt:
          `From this job description, extract the 5 most important screening criteria ` +
          `(skills/experience areas a recruiter would score). Keys are lowercase-kebab. ` +
          `Weights are relative importance 1-5.\n\nJOB DESCRIPTION:\n${jd.slice(0, MAX_JD_CHARS)}`,
      });
      const seen = new Set<string>();
      const criteria: Criterion[] = [];
      for (const c of object.criteria) {
        const key =
          c.key
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || `criterion-${criteria.length + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        criteria.push({
          key,
          title: c.title.trim().slice(0, 80) || key,
          weight: Math.max(1, Math.min(5, Math.round(c.weight))),
          scale: genericScale(c.title),
          doNotUse: [],
        });
        if (criteria.length === 5) break;
      }
      if (criteria.length === 5) return { criteria, derivedBy: "llm" };
    } catch {
      // fall through to generic
    }
  }

  const generic: Criterion[] = [
    {
      key: "relevant-experience",
      title: "Relevant experience",
      weight: 5,
      scale: genericScale("Relevant experience"),
      doNotUse: [],
    },
    {
      key: "technical-skills",
      title: "Technical skills",
      weight: 4,
      scale: genericScale("Technical skills"),
      doNotUse: [],
    },
    {
      key: "impact-and-results",
      title: "Impact & measurable results",
      weight: 3,
      scale: genericScale("Impact and results"),
      doNotUse: [],
    },
    {
      key: "seniority-level",
      title: "Seniority appropriate to the role",
      weight: 2,
      scale: genericScale("Seniority"),
      doNotUse: [],
    },
    {
      key: "communication-quality",
      title: "Resume clarity & communication",
      weight: 1,
      scale: genericScale("Communication"),
      doNotUse: [],
    },
  ];
  return { criteria: generic, derivedBy: "generic" };
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (globalResetAt <= now) {
    globalCount = 0;
    globalResetAt = now + 3_600_000;
  }
  globalCount += 1;
  if (globalCount > RUNS_GLOBAL_PER_HOUR) {
    return NextResponse.json(
      { error: "The free checker is busy right now — try again in about an hour." },
      { status: 429 },
    );
  }

  const ip = clientIp(req);
  const bucket = bucketFor(ip, RUNS_PER_IP_PER_HOUR);
  if (!bucket.allowed) {
    return NextResponse.json(
      {
        error: "You've used all 10 free checks for this hour. Self-hosted HireLens has no limits.",
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil((bucket.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  // Accept either JSON {resumeText, jd} or multipart (file upload + jd).
  let resumeText = "";
  let jd = "";
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      jd = String(form.get("jd") ?? "").slice(0, MAX_JD_CHARS);
      const file = form.get("resume");
      if (file instanceof File) {
        if (file.size > MAX_DOCUMENT_BYTES) {
          return NextResponse.json({ error: "File is larger than 10 MB." }, { status: 413 });
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        if (!isSupportedExtension(ext)) {
          return NextResponse.json(
            { error: "Unsupported file type — use PDF, DOCX, TXT, or MD." },
            { status: 415 },
          );
        }
        const kind = sniffKind(bytes, file.name);
        if (kind === "unknown") {
          return NextResponse.json(
            { error: "This file doesn't look like a resume we can read." },
            { status: 415 },
          );
        }
        const extracted = await extractDocument(bytes, kind);
        resumeText = extracted.pages.join("\n");
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as { resumeText?: unknown; jd?: unknown };
      resumeText = typeof body.resumeText === "string" ? body.resumeText : "";
      jd = typeof body.jd === "string" ? body.jd : "";
    }
  } catch (err) {
    const message =
      err instanceof ExtractionError
        ? "Couldn't read that file — if it's a scanned PDF, try a text-based export."
        : "Couldn't read the request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  resumeText = resumeText.slice(0, MAX_TEXT_CHARS);
  if (resumeText.trim().length < 80) {
    return NextResponse.json(
      { error: "That resume looks too short to score — paste the full text or a real file." },
      { status: 400 },
    );
  }
  if (jd.trim().length < 40) {
    return NextResponse.json(
      { error: "Paste the job description you're targeting (at least a few sentences)." },
      { status: 400 },
    );
  }

  const config = readLlmConfig();
  let model: ReturnType<typeof resolveLanguageModel> | null = null;
  try {
    model = config ? resolveLanguageModel(config) : null;
  } catch {
    model = null;
  }

  const { criteria, derivedBy } = await deriveCriteria(model, jd);
  const rubric: Rubric = {
    version: 1,
    key: "self-check",
    title: "Self-check rubric",
    criteria,
    exclusions: [],
  };

  try {
    if (!model) {
      return NextResponse.json(
        {
          error:
            "The scoring engine isn't configured on this server right now — please try again later.",
        },
        { status: 503 },
      );
    }
    const result = await scoreResume(model, rubric, resumeText);

    // Skill-graph buckets + improvement guidance (v1.2) — same projection
    // the recruiter-shared candidate report uses. Deterministic, free.
    const skills = Array.isArray(
      (() => {
        try {
          return parseCandidate(resumeText).skills;
        } catch {
          return [];
        }
      })(),
    )
      ? parseCandidate(resumeText).skills
      : [];
    const graph = skillGraph(skills, skillsInText(jd));
    const match = matchPct(graph);
    const improve = improvementSteps(
      result.criteria.map((c) => ({
        title: rubric.criteria.find((x) => x.key === c.key)?.title ?? c.key,
        score: c.score,
        evidence: c.evidence ? [c.evidence.quotedText] : [],
      })),
      graph.missing,
    );

    return NextResponse.json({
      ok: true,
      mode: "llm" as const,
      derivedBy,
      overall: result.overall,
      modelId: result.modelId,
      skills: graph,
      matchPct: match,
      improve,
      criteria: result.criteria.map((c) => {
        const crit = rubric.criteria.find((x) => x.key === c.key);
        return {
          key: c.key,
          title: crit?.title ?? c.key,
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
        };
      }),
    });
  } catch {
    // The AI provider is flaky or rate-limited. Never dead-end a public
    // funnel: fall back to a deterministic ATS-style keyword check — the
    // exact terms of the job description found (or missing) in the resume,
    // combined into one honest percentage. Clearly labeled as approximate
    // in the UI; no fake per-criterion precision.
    const STOP = new Set([
      "the",
      "and",
      "for",
      "with",
      "you",
      "your",
      "are",
      "will",
      "have",
      "this",
      "that",
      "from",
      "our",
      "who",
      "all",
      "not",
      "but",
      "can",
      "has",
      "was",
      "were",
      "they",
      "their",
      "them",
      "its",
      "about",
      "into",
      "over",
      "more",
      "most",
      "than",
      "then",
      "when",
      "what",
      "which",
      "while",
      "work",
      "working",
      "role",
      "job",
      "team",
      "teams",
      "years",
      "year",
      "plus",
      "also",
      "any",
      "per",
      "via",
      "using",
      "use",
      "new",
      "hiring",
      "apply",
      "experience",
      "strong",
      "good",
      "great",
      "requirements",
      "responsibilities",
      "preferred",
      "qualifications",
      "company",
      "candidate",
      "candidates",
      "able",
      "must",
      "should",
      "would",
      "like",
      "well",
      "help",
      "across",
      "within",
      "other",
      "others",
      "being",
      "been",
      "does",
      "doing",
      "make",
      "made",
      "take",
      "based",
      "include",
      "including",
      "etc",
    ]);
    // Deterministic extras even in approximate mode (v1.2): skills the JD
    // names that the resume doesn't — honest, useful, no LLM needed.
    let skills: { matched: string[]; adjacent: string[]; missing: string[] } | undefined;
    let improve: string[] | undefined;
    let match = 0;
    try {
      const parsedSkills = parseCandidate(resumeText).skills;
      const graph = skillGraph(parsedSkills, skillsInText(jd));
      skills = graph;
      match = matchPct(graph);
      improve = improvementSteps([], graph.missing);
    } catch {
      // Parsing is best-effort; approximate mode still returns keywords.
    }
    const jdWords = jd
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .map((w) => w.replace(/^[.#+]+|[.#+]+$/g, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
    const terms = [...new Set(jdWords)].slice(0, 40);
    const text = resumeText.toLowerCase();
    const keywords = terms.map((word) => ({ word, found: text.includes(word) }));
    const found = keywords.filter((k) => k.found).length;
    const overall = terms.length ? Math.round((found / terms.length) * 100) : 0;
    return NextResponse.json({
      ok: true,
      mode: "approximate" as const,
      overall,
      keywords,
      skills,
      matchPct: match,
      improve,
    });
  }
}
