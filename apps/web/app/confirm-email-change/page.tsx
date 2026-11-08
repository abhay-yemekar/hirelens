import type { Metadata } from "next";
import { ConfirmEmailChange } from "@/components/confirm-email-change";
import { SignInPanel } from "@/components/sign-in-panel";

export const metadata: Metadata = {
  title: "Confirm your new email — CandidLens",
  robots: { index: false },
  // The address holds the token: never send it to another site.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = typeof params["token"] === "string" ? params["token"] : null;
  return (
    <SignInPanel redirectSignedIn={false}>
      <ConfirmEmailChange token={token} />
    </SignInPanel>
  );
}
