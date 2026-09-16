import type { Metadata } from "next";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Sign in — HireLens",
  description:
    "Sign in to HireLens to run evidence-linked, rubric-based resume screening with tamper-evident audit trails.",
};

export default function SignInPage() {
  return <SignInPanel />;
}
