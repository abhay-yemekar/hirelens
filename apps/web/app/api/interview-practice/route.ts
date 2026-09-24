/**
 * Interview practice (v1.3, candidate side) — POST { action, jd, ... }.
 *
 * action "questions": generate a practice question set from the job
 *   description (5 questions, each with a hint about what a strong
 *   answer covers).
 * action "feedback": evaluate one practice answer — what landed, what to
 *   add, and (LLM mode only) a sample strong answer.
 *
 * Nothing is persisted. Rate limits per IP per hour. Without an LLM key
 * the questions fall back to a JD-derived static set (honest, still
 * useful) and feedback falls back to a structural checklist review —
 * clearly labeled, never passed off as AI judgment.
 */

import { type ProviderConfig, resolveLanguageModel, skillsInText } from "@hirelens/core";
import { generateText } from "ai";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNS_PER_IP_PER_HOUR = 15;
const MAX_JD_CHARS = 15_000;
const MAX_ANSWER_CHARS = 6_000;

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

/** Deterministic question set when no LLM is configured. */
function staticQuestions(jd: string): Array<{ question: string; hint: string }> {
  const skills = skillsInText(jd).slice(0, 4);
  const top = skills[0] ?? "the core skill in this role";
  const second = skills[1] ?? "another listed requirement";
  return [
    {
      question: "Walk me through your background and why it fits this role.",
      hint: "60–90 seconds: your current focus, one relevant achievement with a number, and why this specific role.",
    },
    {
      question: `This role leans heavily on ${top}. Describe the most complex thing you've built with it.`,
      hint: "Use STAR: the situation, your specific task, the actions you took, and the measurable result.",
    },
    {
      question: `Tell me about a time production broke — ideally involving ${second} — and how you handled it.`,
      hint: "They're testing ownership under pressure: detection, mitigation, root cause, and the prevention you added afterwards.",
    },
    {
      question: "How do you decide between shipping quickly and doing it 'right'?",
      hint: "Show a real trade-off you made: what you cut, what you refused to cut, and how it turned out.",
    },
    {
      question: "Do you have any questions for us?",
      hint: "Always have 2–3. Good ones ask about team priorities, how success is measured, or a real challenge the team faces.",
    },
  ];
}

/** Structural feedback without an LLM: honest, checklist-based. */
function structuralFeedback(answer: string): {
  strengths: string[];
  improve: string[];
  sample: null;
} {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const hasNumber = /\d/.test(answer);
  const hasI = /\bI\b|\bmy\b|\bwe\b/i.test(answer);
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const strengths: string[] = [];
  const improve: string[] = [];

  if (words >= 80 && words <= 350)
    strengths.push(`Good length (${words} words) — substantial but deliverable out loud.`);
  else if (words < 80)
    improve.push(
      `Too short (${words} words). Aim for 150–250: add the specific situation and the result.`,
    );
  else
    improve.push(
      `Quite long (${words} words) — interviewers tune out past ~350. Cut to your strongest example.`,
    );

  if (hasNumber)
    strengths.push("You quantified with at least one number — that's exactly what lands.");
  else
    improve.push(
      "No numbers. Add one measurable outcome (%, time saved, scale, revenue) — it's the strongest credibility signal.",
    );

  if (hasI) strengths.push("Clear first-person ownership of the work.");
  else improve.push("Make your individual contribution explicit — 'I did X', not just 'we did X'.");

  if (sentences.length >= 4) strengths.push("Multi-part answer with a real structure.");
  else
    improve.push(
      "Structure it: situation → what you did → result. Three beats, clearly separated.",
    );

  return { strengths, improve, sample: null };
}

function parseQuestions(text: string): Array<{ question: string; hint: string }> | null {
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr) || arr.length < 3) return null;
    const out = arr
      .filter(
        (q): q is { question?: unknown; hint?: unknown } => typeof q === "object" && q !== null,
      )
      .map((q) => ({
        question: typeof q.question === "string" ? q.question.slice(0, 400) : "",
        hint: typeof q.hint === "string" ? q.hint.slice(0, 400) : "",
      }))
      .filter((q) => q.question.length > 10)
      .slice(0, 5);
    return out.length >= 3 ? out : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const limit = bucketFor(`iv:${clientIp(req)}`, RUNS_PER_IP_PER_HOUR);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "That's more practice runs than we allow per hour — please come back a bit later.",
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    jd?: unknown;
    question?: unknown;
    answer?: unknown;
  } | null;
  const action =
    body?.action === "feedback" ? "feedback" : body?.action === "questions" ? "questions" : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  if (action === "questions") {
    const jd = typeof body?.jd === "string" ? body.jd.slice(0, MAX_JD_CHARS) : "";
    if (jd.trim().length < 40) {
      return NextResponse.json(
        { ok: false, error: "Paste the job description first." },
        { status: 400 },
      );
    }

    const config = readLlmConfig();
    if (!config) {
      return NextResponse.json({
        ok: true,
        mode: "static" as const,
        questions: staticQuestions(jd),
        note: "Practice set built from the job description's requirements (no AI on this server) — still the same question types interviewers ask.",
      });
    }

    try {
      const model = resolveLanguageModel(config);
      const r = await generateText({
        model,
        temperature: 0.5,
        system: [
          "You generate realistic interview practice questions for a job applicant.",
          'Return ONLY a JSON array of 5 objects, each: {"question": string, "hint": string}.',
          "Mix: one intro/background, two technical questions anchored in the job description's specific requirements, one behavioral (ownership/conflict/deadline), one closing ('questions for us' prompt).",
          "The hint (1–2 sentences) says what a strong answer covers — never the answer itself.",
        ].join("\n"),
        prompt: `Job description:\n${jd}`,
      });
      const questions = parseQuestions(r.text);
      if (!questions) {
        return NextResponse.json({
          ok: true,
          mode: "static" as const,
          questions: staticQuestions(jd),
          note: "The question generator hiccuped — here's a solid standard set built from the job description.",
        });
      }
      return NextResponse.json({
        ok: true,
        mode: "llm" as const,
        questions,
        note: "Generated from this job description — nothing is stored. Practice out loud; that's where the improvement happens.",
      });
    } catch {
      return NextResponse.json({
        ok: true,
        mode: "static" as const,
        questions: staticQuestions(jd),
        note: "The question generator didn't respond — here's a solid standard set built from the job description.",
      });
    }
  }

  // action === "feedback"
  const answer = typeof body?.answer === "string" ? body.answer.slice(0, MAX_ANSWER_CHARS) : "";
  const question = typeof body?.question === "string" ? body.question.slice(0, 400) : "";
  if (answer.trim().length < 40) {
    return NextResponse.json(
      {
        ok: false,
        error: "Write (or paste) your practice answer first — a sentence or two minimum.",
      },
      { status: 400 },
    );
  }

  const config = readLlmConfig();
  if (!config) {
    const fb = structuralFeedback(answer);
    return NextResponse.json({
      ok: true,
      mode: "structural" as const,
      ...fb,
      note: "Structural review only (no AI on this server) — length, specificity, ownership, and structure checks.",
    });
  }

  try {
    const model = resolveLanguageModel(config);
    const r = await generateText({
      model,
      temperature: 0.3,
      system: [
        "You coach job applicants on interview answers.",
        'Return ONLY JSON: {"strengths": string[], "improve": string[], "sample": string}.',
        "strengths: 1–3 things that landed, each ≤ 2 sentences, referencing the actual content.",
        "improve: 1–3 concrete upgrades (a missing number, an unstated result, a stronger opening), each ≤ 2 sentences.",
        "sample: a ~120-word strong version of THIS answer using ONLY facts the applicant gave. Never invent employers, titles, or numbers.",
        "Be direct and specific; no flattery, no padding.",
      ].join("\n"),
      prompt: `Interview question:\n${question || "(see answer)"}\n\nApplicant's answer:\n${answer}`,
    });
    const start = r.text.indexOf("{");
    const end = r.text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    const parsed = JSON.parse(r.text.slice(start, end + 1)) as {
      strengths?: unknown;
      improve?: unknown;
      sample?: unknown;
    };
    const strengths = Array.isArray(parsed.strengths)
      ? parsed.strengths.filter((s): s is string => typeof s === "string").slice(0, 3)
      : [];
    const improve = Array.isArray(parsed.improve)
      ? parsed.improve.filter((s): s is string => typeof s === "string").slice(0, 3)
      : [];
    const sample = typeof parsed.sample === "string" ? parsed.sample.slice(0, 1_500) : null;
    if (strengths.length === 0 && improve.length === 0) throw new Error("empty");
    return NextResponse.json({
      ok: true,
      mode: "llm" as const,
      strengths,
      improve,
      sample,
      note: "AI coaching on what you wrote — nothing is stored. The sample reuses only your facts; verify every line is true before you say it in a real interview.",
    });
  } catch {
    const fb = structuralFeedback(answer);
    return NextResponse.json({
      ok: true,
      mode: "structural" as const,
      ...fb,
      note: "The coach didn't respond — here's a structural review instead (length, specificity, ownership, structure).",
    });
  }
}
