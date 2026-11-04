"use client";

import { Button } from "@candidlens/ui";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  AuthCard,
  authInputClass,
  authInputStyle,
  authLinkClass,
  authSubmitClass,
} from "@/components/auth-card";
import { PasswordInput } from "@/components/password-input";
import { authClient } from "@/lib/auth-client";

const ERROR_MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
};

/** Keeps the token for this tab once it is out of the address bar. */
const TOKEN_KEY = "candidlens.reset-token";

function savedToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage a reload just asks for a new link.
  }
}

/**
 * Where the reset link in the email lands. Better Auth checks the link
 * first and sends the browser here with ?token=, or with
 * ?error=INVALID_TOKEN when it has expired or was already used.
 *
 * The token is a working credential for up to an hour, so it leaves the
 * address bar as soon as the page opens: page-view analytics, the browser
 * history and anyone looking at the screen never see it.
 */
export function ResetPasswordForm({
  token: tokenFromLink,
  error,
}: {
  token: string | null;
  error: string | null;
}) {
  const [token, setToken] = useState(tokenFromLink);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"checking" | "form" | "done" | "expired">(
    error ? "expired" : tokenFromLink ? "form" : "checking",
  );

  useEffect(() => {
    if (tokenFromLink) saveToken(tokenFromLink);
    if (tokenFromLink || error) {
      window.history.replaceState(null, "", window.location.pathname);
      if (error) saveToken(null);
      return;
    }
    // Reloaded after the token left the address bar.
    const saved = savedToken();
    setToken(saved);
    setState(saved ? "form" : "expired");
  }, [tokenFromLink, error]);
  const passwordId = useId();
  const confirmId = useId();
  const hintId = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password !== confirm) {
      setMessage("The passwords don't match.");
      return;
    }
    if (!token) return;
    setBusy(true);
    const res = await authClient
      .resetPassword({ newPassword: password, token })
      .catch(() => ({ error: { code: undefined, status: 0 } }));
    setBusy(false);
    if (res.error) {
      const code = res.error.code;
      if (code === "INVALID_TOKEN") {
        saveToken(null);
        setState("expired");
        return;
      }
      setMessage((code && ERROR_MESSAGES[code]) || "Couldn't set the password. Try again.");
      return;
    }
    saveToken(null);
    setState("done");
  }

  if (state === "checking") {
    return (
      <AuthCard title="Choose a new password" description="Loading…">
        {null}
      </AuthCard>
    );
  }

  if (state === "expired") {
    return (
      <AuthCard
        title="This link doesn't work anymore"
        description="Reset links work once and expire after 1 hour."
      >
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          <Link href="/forgot-password" className={authLinkClass}>
            Send a new link
          </Link>{" "}
          or{" "}
          <Link href="/signin" className={authLinkClass}>
            sign in
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  if (state === "done") {
    return (
      <AuthCard
        title="Your password is set"
        description="For your security, every device that was signed in is now signed out."
      >
        <Link
          href="/signin"
          className={`inline-flex w-full items-center justify-center rounded-[var(--radius-control)] ${authSubmitClass}`}
        >
          Sign in with your new password
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="You'll use it to sign in from now on.">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor={passwordId} style={{ color: "var(--hl-mist)" }}>
            New password
          </label>
          <PasswordInput
            id={passwordId}
            name="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-describedby={hintId}
            className={authInputClass}
            style={authInputStyle}
          />
          <p id={hintId} className="text-xs" style={{ color: "var(--hl-muted)" }}>
            At least 8 characters.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor={confirmId} style={{ color: "var(--hl-mist)" }}>
            Confirm new password
          </label>
          <PasswordInput
            id={confirmId}
            name="confirm-password"
            required
            minLength={8}
            maxLength={128}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={authInputClass}
            style={authInputStyle}
          />
        </div>
        {message && (
          <p role="alert" className="text-sm" style={{ color: "var(--hl-bad)" }}>
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy} className={authSubmitClass}>
          {busy ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
