import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Live demo — no signup — HireLens",
  description:
    "Pick a synthetic resume, press score: watch real rubric-based scoring arrive with the exact quoted evidence behind every point. No signup, no email.",
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children;
}
