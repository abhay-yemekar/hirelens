"use client";

import { Button } from "@candidlens/ui";
import Link from "next/link";
import { useState } from "react";
import {
  AuthCard,
  authInputClass,
  authInputStyle,
  authLinkClass,
  authSubmitClass,
} from "@/components/auth-card";
import { authClient } from "@/lib/auth-client";
import { EMAIL_ENABLED } from "@/lib/env";

function BackToSignIn() {
  return (
    <p className="mt-4 text-center text-sm" style={{ color: "var(--hl-mist)" }}>
      <Link href="/signin" className={authLinkClass}>
        Back to sign in
      </Link>
    </p>
  );
}

/**
 * "Forgot password?": asks for the email and sends a reset link. The answer
 * is the same whether or not an account uses that email, so the page
 * doesn't tell strangers who has an account. A reset also works for an
 * account made with Google or GitHub: it gets its first password.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!EMAIL_ENABLED) {
    return (
      <AuthCard
        title="Reset your password"
        description="This server can't send email, so passwords can't be reset by email here."
      >
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          If your account uses Google or GitHub, sign in with that button instead. Otherwise, ask
          whoever runs this server to set up email.
        </p>
        <BackToSignIn />
      </AuthCard>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await authClient
      .requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      })
      .catch(() => ({ error: { status: 0 } }));
    setBusy(false);
    if (res.error) {
      setError(
        res.error.status === 429
          ? "Too many requests. Wait a minute, then try again."
          : "Couldn't send the link. Try again in a few minutes.",
      );
      return;
    }
    setSentTo(email.trim());
  }

  return (
    <AuthCard
      title={sentTo ? "Check your email" : "Reset your password"}
      description={
        sentTo
          ? "The link expires in 1 hour."
          : "Enter the email you sign in with. We'll send you a link to choose a new password."
      }
    >
      {/* Stays in place when the form gives way to the result, so screen
          readers announce it. */}
      <div aria-live="polite">
        {sentTo ? (
          <div className="flex flex-col gap-3 text-sm">
            <p style={{ color: "var(--hl-cream)" }}>
              If an account uses <span className="break-all font-medium">{sentTo}</span>, we've sent
              it a link to choose a new password.
            </p>
            <p style={{ color: "var(--hl-mist)" }}>
              Nothing after a few minutes? Check your spam folder, or{" "}
              <button
                type="button"
                className={authLinkClass}
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
              >
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: "var(--hl-mist)" }}>Email</span>
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                spellCheck={false}
                className={authInputClass}
                style={authInputStyle}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm" style={{ color: "var(--hl-bad)" }}>
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className={authSubmitClass}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </div>
      <BackToSignIn />
    </AuthCard>
  );
}
