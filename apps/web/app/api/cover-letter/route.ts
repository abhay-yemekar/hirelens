/**
 * Cover letter drafts (v1.3, candidate side) — POST { resumeText, jd }.
 *
 * Privacy-first by construction: the letter is generated from the request
 * body and returned; nothing is persisted, logged, or added to any
 * training set. Rate limits mirror the self-check endpoint but tighter
 * (5/hour/IP) — letters are the heavier call.
 *
 * No LLM configured → an honest fill-in template, clearly labeled, never
 * passed off as AI-crafted.
 */

import { type ProviderConfig, resolveLanguageModel } from "@hirelens/core";
import { generateText } from "ai";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LETTERS_PER_IP_PER_HOUR = 5;
const MAX_RESUME_CHARS = 30_000;
const MAX_JD_CHARS = 15_000;
const MAX_LETTER_CHARS = 4_000;

interface Bucket {
  count: number;
  resetAt: number;
}
const ipBuckets = new Map<string, Bucket>();

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

/** Top JD terms for the deterministic template mode. */
function jdHeadlineTerms(jd: string): string[] {
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
    "than",
    "then",
    "when",
    "what",
    "which",
    "while",
    "role",
    "job",
    "team",
    "work",
    "experience",
    "strong",
    "years",
    "year",
    "requirements",
    "responsibilities",
    "preferred",
    "qualifications",
    "company",
    "candidate",
    "able",
    "must",
    "should",
    "would",
    "like",
    "well",
    "help",
    "using",
    "use",
    "new",
    "hiring",
    "apply",
    "plus",
    "also",
    "any",
    "per",
    "via",
    "based",
    "include",
    "including",
    "etc",
    "across",
    "within",
    "other",
    "being",
    "been",
    "does",
    "doing",
    "make",
    "made",
    "take",
  ]);
  const words = jd
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^[.#+]+|[.#+]+$/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 5);
}

/**
 * Deterministic template (no-LLM path): honest scaffolding with the JD's
 * real terms slotted in — explicitly labeled as a template in the response.
 */
function templateLetter(resumeText: string, jd: string): string {
  const terms = jdHeadlineTerms(jd);
  const focus = terms.length ? terms.join(", ") : "the skills named in the job description";
  const firstResumeLine =
    resumeText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return [
    "Dear Hiring Team,",
    "",
    `I'm applying for this role because it centers on ${focus} — the same areas I work in every day. [Replace this paragraph with 2–3 sentences on your most relevant achievement, with a number in it.]`,
    "",
    `[Second paragraph: one concrete story from your experience that matches the job's top requirement. What you did, how you did it, and the measurable result.]`,
    "",
    `What draws me to this position specifically is [one true, specific thing about the company or role — never generic].`,
    "",
    "Thank you for your consideration. I'd welcome the chance to walk through my work in an interview.",
    "",
    "Sincerely,",
    firstResumeLine || "[Your name]",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const limit = bucketFor(`cl:${clientIp(req)}`, LETTERS_PER_IP_PER_HOUR);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "That's more drafts than we can generate per hour — please try again later.",
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    resumeText?: unknown;
    jd?: unknown;
  } | null;
  const resumeText =
    typeof body?.resumeText === "string" ? body.resumeText.slice(0, MAX_RESUME_CHARS) : "";
  const jd = typeof body?.jd === "string" ? body.jd.slice(0, MAX_JD_CHARS) : "";
  if (resumeText.trim().length < 80 || jd.trim().length < 40) {
    return NextResponse.json(
      { ok: false, error: "Add your resume text and the job description first." },
      { status: 400 },
    );
  }

  const config = readLlmConfig();
  if (!config) {
    return NextResponse.json({
      ok: true,
      mode: "template" as const,
      letter: templateLetter(resumeText, jd),
      note: "Template mode — the scoring engine isn't configured on this server, so this is a fill-in scaffold, not AI-crafted text.",
    });
  }

  try {
    const model = resolveLanguageModel(config);
    const r = await generateText({
      model,
      temperature: 0.4,
      system: [
        "You draft short, specific cover letters for job applicants.",
        "Rules:",
        "- 180–250 words, 4 short paragraphs.",
        "- Use ONLY facts present in the resume. Never invent employers, numbers, or credentials.",
        "- Open with a specific reason this role fits; reference 2–3 requirements from the job description with matching resume evidence.",
        "- Include at most one bracketed [placeholder] ONLY if a truly needed fact (like the company name) is absent.",
        "- Plain professional tone. No clichés ('I am writing to apply'), no em-dash pileups, no bullet lists.",
        "Return ONLY the letter text.",
      ].join("\n"),
      prompt: `Job description:\n${jd}\n\nResume:\n${resumeText}`,
    });
    const letter = r.text.trim().slice(0, MAX_LETTER_CHARS);
    return NextResponse.json({
      ok: true,
      mode: "llm" as const,
      letter,
      note: "Drafted from your resume and this job description — nothing is stored. Read every claim before sending: you own this letter.",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "The drafting engine didn't respond — please try again in a moment." },
      { status: 502 },
    );
  }
}
