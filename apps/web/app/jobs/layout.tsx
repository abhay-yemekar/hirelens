import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jobs — HireLens",
  description: "Create roles, upload resumes, and run evidence-linked scoring.",
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
