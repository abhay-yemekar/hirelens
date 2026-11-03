import type { Metadata } from "next";
import TrackerClient from "./tracker-client";

export const metadata: Metadata = {
  title: "Application tracker — CandidLens",
  description:
    "Track your job applications — role, company, status, notes, and your CandidLens self-check score. Stored on your device only, exportable as CSV.",
};

export default function TrackerPage() {
  return <TrackerClient />;
}
