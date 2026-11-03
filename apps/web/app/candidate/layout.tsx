import type { Metadata } from "next";
import { SideGate } from "@/components/side-gate";

export const metadata: Metadata = {
  title: "Candidate hub — CandidLens",
};

/**
 * The candidate hub is candidate-side only: recruiter-track sessions are
 * held and hard-redirected to /jobs by the gate.
 */
export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return <SideGate side="candidate">{children}</SideGate>;
}
