import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Choose a new password — CandidLens",
  robots: { index: false },
  // The address holds the reset token: never send it to another site.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = typeof params["token"] === "string" ? params["token"] : null;
  const error = typeof params["error"] === "string" ? params["error"] : null;
  return (
    <SignInPanel redirectSignedIn={false}>
      <ResetPasswordForm token={token} error={error} />
    </SignInPanel>
  );
}
