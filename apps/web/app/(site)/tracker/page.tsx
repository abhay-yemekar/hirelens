import type { Metadata } from "next";
import TrackerClient from "./tracker-client";

export const metadata: Metadata = {
  title: "Application tracker — HireLens",
  description:
    "Track your job applications — role, company, status, notes, and your HireLens self-check score. Stored on your device only, exportable as CSV.",
};

export default function TrackerPage() {
  return <TrackerClient />;
}
