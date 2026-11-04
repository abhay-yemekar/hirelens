"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@candidlens/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { ApiRequestError, addPassword } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { EMAIL_ENABLED } from "@/lib/env";

/**
 * Sign-in & security (Settings), for recruiters and candidates alike:
 * which ways the user can sign in, confirming the email address, adding,
 * changing or removing a password, linking Google or GitHub, and signing
 * out other devices.
 * Adding a first password goes through the API (Better Auth exposes it
 * server-side only); the rest uses the Better Auth client directly.
 */

const GOOGLE_ENABLED = process.env["NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED"] === "true";
const GITHUB_ENABLED = process.env["NEXT_PUBLIC_GITHUB_OAUTH_ENABLED"] === "true";

type Provider = "google" | "github";
const PROVIDERS: Array<{ id: Provider; label: string; enabled: boolean }> = [
  { id: "google", label: "Google", enabled: GOOGLE_ENABLED },
  { id: "github", label: "GitHub", enabled: GITHUB_ENABLED },
];

/** Plain-language messages for the error codes these actions can return. */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "Your current password is wrong.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
  FAILED_TO_UNLINK_LAST_ACCOUNT: "Keep at least one way to sign in.",
  SESSION_NOT_FRESH: "For your security, sign out and sign in again, then try again.",
  session_not_fresh: "For your security, sign out and sign in again, then add the password.",
  password_already_set: "This account already has a password. Change it instead.",
  email_does_not_match:
    "That account uses a different email address, so it can't be connected to this one.",
  account_already_linked_to_different_user: "That account is already connected to another user.",
  unable_to_link_account: "That account could not be connected. Try again.",
  // From the email confirmation link.
  TOKEN_EXPIRED: "That confirmation link has expired. Send a new one.",
  INVALID_TOKEN: "That confirmation link isn't valid. Send a new one.",
  USER_NOT_FOUND: "That confirmation link isn't valid. Send a new one.",
  EMAIL_ALREADY_VERIFIED: "Your email address is already confirmed.",
  TOO_MANY_EMAILS: "Too many emails to this address. Try again in an hour.",
  EMAIL_QUOTA_REACHED: "This server has sent its email for today. Try again tomorrow.",
};

function messageFor(code: string | undefined, fallback: string): string {
  return (code && ERROR_MESSAGES[code]) || fallback;
}

/** Which part of the card a message belongs to; it shows next to that part. */
type Area = "methods" | "password" | "devices";
type Status = { area: Area; kind: "ok" | "error"; text: string } | null;
type LinkedAccount = { id: string; providerId: string };
/** Stands in for a list request that threw (for example, the network failed). */
const NOT_LOADED = { error: true, data: null } as const;

const inputClass =
  "rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--hl-accent-soft)]";
const inputStyle = { borderColor: "var(--hl-border)", background: "var(--hl-input)" };

function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} style={{ color: "var(--hl-mist)" }}>
        {label}
      </label>
      <PasswordInput
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={autoComplete === "new-password" ? 8 : undefined}
        maxLength={128}
        required
        className={inputClass}
        style={inputStyle}
      />
    </div>
  );
}

/** A polite live region for one part of the card; empty unless its message is current. */
function StatusLine({ status, area }: { status: Status; area: Area }) {
  return (
    <p aria-live="polite" className="text-sm empty:hidden">
      {status?.area === area && (
        <span
          style={{ color: status.kind === "ok" ? "var(--color-success)" : "var(--color-danger)" }}
        >
          {status.text}
        </span>
      )}
    </p>
  );
}

export function SignInCard() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const email = session?.user?.email ?? "";
  const emailVerified = session?.user?.emailVerified === true;
  // null while loading; "failed" when the request did not succeed.
  const [accounts, setAccounts] = useState<LinkedAccount[] | "failed" | null>(null);
  const [sessionCount, setSessionCount] = useState<number | "failed" | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const [linked, sessions] = await Promise.all([
      authClient.listAccounts(),
      authClient.listSessions(),
    ]).catch(() => [NOT_LOADED, NOT_LOADED] as const);
    // A newer load started while this one was in flight; its answer wins.
    if (seq !== loadSeq.current) return;
    setAccounts(
      linked.error || !linked.data
        ? "failed"
        : linked.data.map((a) => ({ id: a.id, providerId: a.providerId })),
    );
    // Listing devices needs a sign-in within the last day; signing them
    // out does not, so a failed list leaves that button usable.
    setSessionCount(sessions.error || !sessions.data ? "failed" : sessions.data.length);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [userId, load]);

  useEffect(() => {
    // Back from a Google/GitHub connect attempt that failed, or from the
    // email confirmation link. Drop the query afterwards so a reload
    // doesn't show the message again.
    const query = new URLSearchParams(window.location.search);
    const error = query.get("error");
    if (error) {
      setStatus({
        area: "methods",
        kind: "error",
        text: messageFor(error, "That account could not be connected."),
      });
    } else if (query.get("verified") === "1") {
      setStatus({ area: "methods", kind: "ok", text: "Your email address is confirmed." });
    } else {
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const linked = Array.isArray(accounts) ? accounts : null;
  const providers = linked?.map((a) => a.providerId) ?? null;
  const hasPassword = providers?.includes("credential") ?? false;
  const methodCount = providers?.length ?? 0;

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (next !== confirm) {
      setStatus({ area: "password", kind: "error", text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      if (hasPassword) {
        const res = await authClient.changePassword({
          currentPassword: current,
          newPassword: next,
          revokeOtherSessions: signOutOthers,
        });
        if (res.error) throw res.error;
        setStatus({
          area: "password",
          kind: "ok",
          text: signOutOthers
            ? "Password changed. Other devices are signed out."
            : "Password changed.",
        });
      } else {
        await addPassword(next);
        setStatus({
          area: "password",
          kind: "ok",
          text: `Password added. You can now also sign in with ${email} and this password.`,
        });
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      await load();
    } catch (err) {
      const code =
        err instanceof ApiRequestError ? err.code : (err as { code?: string } | null)?.code;
      const fallback = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setStatus({ area: "password", kind: "error", text: messageFor(code, fallback) });
    } finally {
      setBusy(false);
    }
  }

  async function connect(provider: Provider, label: string) {
    setStatus(null);
    setBusy(true);
    // Leaves the page for the provider, then returns here; a failed link
    // returns here too, with ?error=.
    const settingsURL = `${window.location.origin}/settings`;
    const res = await authClient.linkSocial({
      provider,
      callbackURL: settingsURL,
      errorCallbackURL: settingsURL,
    });
    if (res.error) {
      setBusy(false);
      setStatus({
        area: "methods",
        kind: "error",
        text: `Could not start connecting ${label}. Is it set up on this server?`,
      });
    }
  }

  /** Remove one sign-in method: Google, GitHub or the password ("credential"). */
  async function disconnect(providerId: string, question: string, done: string) {
    const row = linked?.find((a) => a.providerId === providerId);
    if (!row || !window.confirm(question)) return;
    setStatus(null);
    setBusy(true);
    const res = await authClient.unlinkAccount({ accountId: row.id });
    setBusy(false);
    if (res.error) {
      setStatus({
        area: "methods",
        kind: "error",
        text: messageFor(res.error.code, "That didn't work. Try again."),
      });
      return;
    }
    setStatus({ area: "methods", kind: "ok", text: done });
    await load();
  }

  async function sendConfirmation() {
    setStatus(null);
    setBusy(true);
    const res = await authClient
      .sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/settings?verified=1`,
      })
      .catch(() => ({ error: { code: undefined, status: 0 } }));
    setBusy(false);
    if (res.error) {
      setStatus({
        area: "methods",
        kind: "error",
        text: messageFor(
          res.error.code,
          res.error.status === 429
            ? "Too many requests. Wait a minute, then try again."
            : "Couldn't send the link. Try again in a few minutes.",
        ),
      });
      return;
    }
    setStatus({
      area: "methods",
      kind: "ok",
      text: `We sent a confirmation link to ${email}. It expires in 24 hours.`,
    });
  }

  async function signOutOtherDevices() {
    setStatus(null);
    setBusy(true);
    const res = await authClient.revokeOtherSessions();
    setBusy(false);
    if (res.error) {
      setStatus({
        area: "devices",
        kind: "error",
        text: "Could not sign out other devices. Try again.",
      });
      return;
    }
    setStatus({ area: "devices", kind: "ok", text: "Other devices are signed out." });
    await load();
  }

  const onlyMethod = methodCount <= 1;
  const onlyMethodTitle = onlyMethod ? "Keep at least one way to sign in" : undefined;

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Sign-in & security</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          The ways you can sign in to {email || "your account"}, your password, and the devices
          you're signed in on.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="sign-in-methods" className="flex flex-col gap-3">
          <h3 id="sign-in-methods" className="text-sm font-semibold text-[var(--hl-cream)]">
            Sign-in methods
          </h3>
          {accounts === "failed" ? (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              Could not load your sign-in methods. Reload the page to try again.
            </p>
          ) : providers === null ? (
            <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
              Loading…
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <li className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--hl-cream)" }}>Email address</span>
                {emailVerified ? (
                  <span style={{ color: "var(--hl-mist)" }}>Confirmed</span>
                ) : (
                  <span className="flex items-center gap-3">
                    <span style={{ color: "var(--hl-mist)" }}>Not confirmed</span>
                    {EMAIL_ENABLED && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void sendConfirmation()}
                      >
                        Send confirmation link
                      </Button>
                    )}
                  </span>
                )}
              </li>
              <li className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--hl-cream)" }}>Email and password</span>
                {hasPassword ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || onlyMethod}
                    title={onlyMethodTitle}
                    onClick={() =>
                      void disconnect(
                        "credential",
                        "Remove your password? You'll sign in with your connected accounts only.",
                        "Password removed.",
                      )
                    }
                  >
                    Remove password
                  </Button>
                ) : (
                  <span style={{ color: "var(--hl-mist)" }}>No password yet</span>
                )}
              </li>
              {PROVIDERS.filter((p) => p.enabled).map((p) => {
                const connected = providers.includes(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span style={{ color: "var(--hl-cream)" }}>{p.label}</span>
                    {connected ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || onlyMethod}
                        title={onlyMethodTitle}
                        onClick={() =>
                          void disconnect(
                            p.id,
                            `Disconnect ${p.label}? You won't be able to sign in with it until you connect it again.`,
                            `${p.label} disconnected.`,
                          )
                        }
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void connect(p.id, p.label)}
                      >
                        Connect
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <StatusLine status={status} area="methods" />
        </section>

        {providers !== null && (
          <form
            onSubmit={savePassword}
            aria-labelledby="password-heading"
            className="flex flex-col gap-3"
          >
            <h3 id="password-heading" className="text-sm font-semibold text-[var(--hl-cream)]">
              {hasPassword ? "Change password" : "Add a password"}
            </h3>
            {!hasPassword && (
              <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
                Lets you sign in with {email || "your email"} and a password, as well as the
                accounts connected above. For your security, this needs a sign-in within the last 15
                minutes.
              </p>
            )}
            {hasPassword && (
              <PasswordField
                label="Current password"
                name="current-password"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
              />
            )}
            <PasswordField
              label="New password (8 to 128 characters)"
              name="new-password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm new password"
              name="confirm-password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            {hasPassword && (
              <label
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--hl-mist)" }}
              >
                <input
                  type="checkbox"
                  checked={signOutOthers}
                  onChange={(e) => setSignOutOthers(e.target.checked)}
                />
                Sign out other devices
              </label>
            )}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : hasPassword ? "Change password" : "Add password"}
              </Button>
            </div>
            <StatusLine status={status} area="password" />
          </form>
        )}

        <section aria-labelledby="devices-heading" className="flex flex-col gap-3">
          <h3 id="devices-heading" className="text-sm font-semibold text-[var(--hl-cream)]">
            Devices
          </h3>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--hl-mist)" }}>
              {sessionCount === null
                ? "Loading…"
                : sessionCount === "failed"
                  ? "To see your devices, sign out and sign in again."
                  : sessionCount === 1
                    ? "You're signed in on this device only."
                    : `You're signed in on ${sessionCount} devices.`}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || sessionCount === null || sessionCount === 1}
              onClick={() => void signOutOtherDevices()}
            >
              Sign out other devices
            </Button>
          </div>
          <StatusLine status={status} area="devices" />
        </section>
      </CardContent>
    </Card>
  );
}
