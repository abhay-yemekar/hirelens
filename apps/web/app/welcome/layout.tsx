import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up your workspace — CandidLens",
  description: "Create or choose your CandidLens organization to start screening.",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
