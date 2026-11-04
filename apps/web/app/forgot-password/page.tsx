import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Reset your password — CandidLens",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <SignInPanel redirectSignedIn={false}>
      <ForgotPasswordForm />
    </SignInPanel>
  );
}
