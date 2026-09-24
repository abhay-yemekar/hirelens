import type { Metadata } from "next";
import InterviewPracticeClient from "./practice-client";

export const metadata: Metadata = {
  title: "Practice interviews — free — HireLens",
  description:
    "Practice interview questions generated from any job description, with per-answer coaching: what landed, what to add, and a stronger version using only your facts. Free, no signup, nothing stored.",
};

export default function InterviewPracticePage() {
  return <InterviewPracticeClient />;
}
