"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useState } from "react";

/**
 * Interview practice (v1.3, candidate side) — questions from a JD, then
 * answer-by-answer coaching. Same shape as self-check: free, no account,
 * nothing stored, honest labeling when the AI path isn't available.
 */

interface Question {
  question: string;
  hint: string;
}

interface Feedback {
  strengths: string[];
  improve: string[];
  sample: string | null;
  mode: "llm" | "structural";
  note: string;
}

export default function InterviewPracticeClient() {
  const [jd, setJd] = useState("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [questionsNote, setQuestionsNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeIdx, setActiveIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  async function getQuestions() {
    setBusy(true);
    setError(null);
    setQuestions(null);
    setFeedback(null);
    setAnswer("");
    setActiveIdx(0);
    try {
      const res = await fetch("/api/interview-practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "questions", jd }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        questions?: Question[];
        note?: string;
      };
      if (!res.ok || !body.ok || !body.questions) {
        setError(body.error ?? "Couldn't build the question set — please try again.");
      } else {
        setQuestions(body.questions);
        setQuestionsNote(body.note ?? "");
      }
    } catch {
      setError("Network hiccup — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function getFeedback() {
    if (!questions) return;
    setFbBusy(true);
    setFbError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/interview-practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          question: questions[activeIdx]?.question ?? "",
          answer,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        strengths?: string[];
        improve?: string[];
        sample?: string | null;
        mode?: "llm" | "structural";
        note?: string;
      };
      if (!res.ok || !body.ok) {
        setFbError(body.error ?? "Couldn't review the answer — please try again.");
      } else {
        setFeedback({
          strengths: body.strengths ?? [],
          improve: body.improve ?? [],
          sample: body.sample ?? null,
          mode: body.mode ?? "structural",
          note: body.note ?? "",
        });
      }
    } catch {
      setFbError("Network hiccup — please try again.");
    } finally {
      setFbBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--hl-warn)]">
          Free · No signup
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Practice interviews</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--hl-mist)]">
          Paste the job description — get the questions that interview will actually ask, then coach
          your answers one by one. Nothing is stored; practice out loud for the real gain.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>The job description</CardTitle>
          <CardDescription>
            Questions are anchored to what this specific role requires.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            rows={7}
            aria-label="Job description"
            placeholder="Paste the posting you're preparing for…"
            className="w-full rounded-lg border p-4 text-sm leading-6"
            style={{
              borderColor: "var(--hl-border)",
              background: "var(--hl-card)",
              color: "var(--hl-cream)",
            }}
          />
          <div>
            <Button
              onClick={getQuestions}
              disabled={busy || jd.trim().length < 40}
              className="disabled:opacity-40"
            >
              {busy
                ? "Preparing…"
                : questions
                  ? "↻ New question set"
                  : "Give me practice questions"}
            </Button>
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--hl-warn)" }}>
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {questions && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Your practice set</CardTitle>
            <CardDescription>
              Answer one at a time — write it, then say it out loud.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ol className="flex flex-col gap-2">
              {questions.map((q, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIdx(i);
                      setAnswer("");
                      setFeedback(null);
                      setFbError(null);
                    }}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-white/[0.04]"
                    style={{
                      borderColor: i === activeIdx ? "var(--hl-accent)" : "var(--hl-border)",
                      background: i === activeIdx ? "var(--hl-accent-soft)" : "transparent",
                    }}
                  >
                    <span className="block text-sm font-semibold">
                      {i + 1}. {q.question}
                    </span>
                    <span className="mt-1 block text-xs" style={{ color: "var(--hl-mist)" }}>
                      {q.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {questionsNote && (
              <p className="text-xs" style={{ color: "var(--hl-mist)" }}>
                {questionsNote}
              </p>
            )}

            <div
              className="flex flex-col gap-2 border-t pt-4"
              style={{ borderColor: "var(--hl-border)" }}
            >
              <p className="text-sm font-semibold">Your answer to question {activeIdx + 1}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={7}
                aria-label="Your practice answer"
                placeholder="Write how you'd answer out loud — specifics, numbers, your role…"
                className="w-full rounded-lg border p-4 text-sm leading-6"
                style={{
                  borderColor: "var(--hl-border)",
                  background: "var(--hl-card)",
                  color: "var(--hl-cream)",
                }}
              />
              <div>
                <Button
                  onClick={getFeedback}
                  disabled={fbBusy || answer.trim().length < 40}
                  variant="outline"
                  className="disabled:opacity-40"
                >
                  {fbBusy ? "Reviewing…" : "Coach my answer"}
                </Button>
              </div>
              {fbError && (
                <p className="text-sm" style={{ color: "var(--hl-warn)" }}>
                  {fbError}
                </p>
              )}
            </div>

            {feedback && (
              <div
                className="flex flex-col gap-3 rounded-lg border p-4"
                style={{ borderColor: "var(--hl-border)" }}
              >
                {feedback.strengths.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "rgb(52,211,153)" }}>
                      What landed
                    </p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm">
                      {feedback.strengths.map((s, i) => (
                        <li key={i} className="text-[var(--hl-mist)]">
                          + {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.improve.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--hl-warn)" }}>
                      What to add
                    </p>
                    <ul className="mt-1 flex flex-col gap-1 text-sm">
                      {feedback.improve.map((s, i) => (
                        <li key={i} className="text-[var(--hl-mist)]">
                          → {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.sample && (
                  <div>
                    <p className="text-sm font-semibold">A stronger version (your facts only)</p>
                    <p
                      className="mt-1 whitespace-pre-wrap rounded-lg border p-3 text-sm leading-6"
                      style={{ borderColor: "var(--hl-border)", color: "var(--hl-mist)" }}
                    >
                      {feedback.sample}
                    </p>
                  </div>
                )}
                <p className="text-xs" style={{ color: "var(--hl-mist)" }}>
                  {feedback.note}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-center text-sm" style={{ color: "var(--hl-mist)" }}>
        Preparing the application too?{" "}
        <Link
          href="/self-check"
          className="underline underline-offset-2"
          style={{ color: "var(--hl-accent)" }}
        >
          Score your resume against this job →
        </Link>
      </p>
    </main>
  );
}
