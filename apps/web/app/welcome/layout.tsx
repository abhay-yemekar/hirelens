import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get started — HireLens",
  description: "Create or choose your HireLens organization to start screening.",
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
