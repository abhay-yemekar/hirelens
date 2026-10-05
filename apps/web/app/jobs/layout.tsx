import type { Metadata } from "next";
import { SideGate } from "@/components/side-gate";

export const metadata: Metadata = {
  title: "Jobs — HireLens",
  description: "Create roles, upload resumes, and run evidence-linked scoring.",
};

/**
 * Every /jobs/* page is recruiter-side only. The gate holds rendering and
 * hard-redirects candidate-track sessions to /candidate — direct URLs,
 * stale tabs, and old bookmarks included.
 */
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <SideGate side="recruiter">{children}</SideGate>;
}
