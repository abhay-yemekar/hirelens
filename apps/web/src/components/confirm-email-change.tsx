"use client";

import { Button } from "@candidlens/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthCard, authLinkClass, authSubmitClass } from "@/components/auth-card";
import { ApiRequestError, confirmEmailChange, pendingEmailChange } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

/** Keeps the token for this tab once it is out of the address bar. */
const TOKEN_KEY = "candidlens.email-change-token";

function readToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage, a reload just needs the link opened again.
  }
}

type View =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "expired" }
  | { kind: "confirm"; newEmail: string }
  | { kind: "done"; newEmail: string };

/**
 * Where the link in the "Confirm your new email" message lands. Nothing
 * changes until the signed-in owner of the request presses Confirm: the
 * server only accepts the token from the account that asked for it.
 */
export function ConfirmEmailChange({ token: tokenFromLink }: { token: string | null }) {
  const { data: session, isPending } = useSession();
  const [token, setToken] = useState(tokenFromLink);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The token is a working credential: keep it out of the address bar,
    // history and page-view analytics.
    if (tokenFromLink) {
      writeToken(tokenFromLink);
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      setToken(readToken());
    }
  }, [tokenFromLink]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setView({ kind: "signed-out" });
      return;
    }
    if (!token && !readToken()) {
      setView({ kind: "expired" });
      return;
    }
    let cancelled = false;
    pendingEmailChange()
      .then((res) => {
        if (cancelled) return;
        setView(res.newEmail ? { kind: "confirm", newEmail: res.newEmail } : { kind: "expired" });
      })
      .catch(() => {
        if (!cancelled) setView({ kind: "expired" });
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, session, token]);

  async function confirm() {
    const value = token ?? readToken();
    if (!value) {
      setView({ kind: "expired" });
      return;
    }
    setMessage(null);
    setBusy(true);
    try {
      const res = await confirmEmailChange(value);
      writeToken(null);
      setView({ kind: "done", newEmail: res.email });
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : undefined;
      if (code === "invalid_token") {
        writeToken(null);
        setView({ kind: "expired" });
      } else {
        setMessage(err instanceof Error ? err.message : "Couldn't change the email. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "loading") {
    return (
      <AuthCard title="Confirm your new email" description="Loading…">
        {null}
      </AuthCard>
    );
  }

  if (view.kind === "signed-out") {
    return (
      <AuthCard
        title="Sign in to confirm"
        description="Only the account that asked for the change can confirm it."
      >
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          <Link href="/signin" className={authLinkClass}>
            Sign in
          </Link>{" "}
          with your current email, then open the link from the email again.
        </p>
      </AuthCard>
    );
  }

  if (view.kind === "expired") {
    return (
      <AuthCard
        title="This link doesn't work anymore"
        description="Links to change your email work once and expire after 1 hour."
      >
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          Ask for a new one under{" "}
          <Link href="/settings" className={authLinkClass}>
            Settings → Sign-in & security
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  if (view.kind === "done") {
    return (
      <AuthCard title="Your email is changed" description="Use it to sign in from now on.">
        <div aria-live="polite" className="flex flex-col gap-4 text-sm">
          <p style={{ color: "var(--hl-cream)" }}>
            Your sign-in email is now <span className="break-all font-medium">{view.newEmail}</span>
            . We let your old address know.
          </p>
          {/* A full page load, so Settings shows the new email. */}
          <a
            href="/settings"
            className={`inline-flex w-full items-center justify-center rounded-[var(--radius-control)] ${authSubmitClass}`}
          >
            Back to Settings
          </a>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Confirm your new email"
      description="Your account's sign-in email will change."
    >
      <div className="flex flex-col gap-4 text-sm">
        <p style={{ color: "var(--hl-cream)" }}>
          From <span className="break-all font-medium">{session?.user?.email}</span> to{" "}
          <span className="break-all font-medium">{view.newEmail}</span>.
        </p>
        {message && (
          <p role="alert" style={{ color: "var(--hl-bad)" }}>
            {message}
          </p>
        )}
        <Button className={authSubmitClass} disabled={busy} onClick={() => void confirm()}>
          {busy ? "Changing…" : "Confirm the change"}
        </Button>
        <Link href="/settings" className={`self-center ${authLinkClass}`}>
          Cancel
        </Link>
      </div>
    </AuthCard>
  );
}
