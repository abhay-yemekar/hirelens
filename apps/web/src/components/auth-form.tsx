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
import { authClient, userTrack } from "@/lib/auth-client";
import { EMAIL_ENABLED } from "@/lib/env";

/**
 * After sign-in, land on the session side's home. The track is re-read
 * from a fresh session fetch (not the client cache) and the landing is a
 * hard navigation — this was the production bug where candidates signed
 * in and landed on the recruiter Jobs page (or vice versa).
 */
async function landOnSideHome(): Promise<void> {
  let side: "candidate" | "recruiter" | null = null;
  try {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    if (res.ok) {
      const data = (await res.json()) as { user?: Record<string, unknown> } | null;
      side = userTrack(data?.user);
    }
  } catch {
    // Fall through to the default landing below.
  }
  window.location.assign(
    side === "candidate" ? "/candidate" : side === "recruiter" ? "/jobs" : "/track",
  );
}

type Mode = "signin" | "signup";

/**
 * Which social providers the *client* should render. The server decides
 * reality (packages/db/auth.config.ts enables a provider only when both
 * its env vars are set); these NEXT_PUBLIC flags keep the UI honest for
 * the current deployment. Empty => button hidden.
 */
const GOOGLE_ENABLED = process.env["NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED"] === "true";
const GITHUB_ENABLED = process.env["NEXT_PUBLIC_GITHUB_OAUTH_ENABLED"] === "true";

/**
 * Clearer text for the two errors people hit when their email belongs to
 * an account made with Google or GitHub (it has no password yet) or when
 * they have forgotten the password.
 */
function authErrorText(
  error: { code?: string | undefined; message?: string | undefined },
  fallback: string,
): string {
  const social = GOOGLE_ENABLED || GITHUB_ENABLED;
  const reset = EMAIL_ENABLED ? " Or use “Forgot password?” to set a new one by email." : "";
  if (
    error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
    error.code === "USER_ALREADY_EXISTS"
  ) {
    return social
      ? `An account with this email already exists. Sign in instead: if you created it with Google or GitHub, use that button.${reset}`
      : `An account with this email already exists. Sign in instead.${reset}`;
  }
  if (error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return social
      ? `Wrong email or password. If you usually sign in with Google or GitHub, use that button.${reset}`
      : `Wrong email or password.${reset}`;
  }
  return error.message ?? fallback;
}

/**
 * Text for the ?error= Better Auth adds when a Google or GitHub sign-in
 * comes back without signing in.
 */
function socialErrorText(code: string): string {
  if (code === "account_not_linked") {
    // Google and GitHub never join an existing account on their own
    // (packages/db/auth.config.ts); the user connects them from Settings.
    return `This email already has a CandidLens account. Sign in the way you did before (email and password, or the other button), then connect this one under Settings → Sign-in & security.${
      EMAIL_ENABLED ? " No password yet, or forgot it? Use “Forgot password?”." : ""
    }`;
  }
  return "That sign-in didn't work. Try again.";
}

/** Official Google "G" mark — the four-color logo, as inline SVG. */
function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Official GitHub octocat mark, as inline SVG. */
function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<"google" | "github" | null>(null);
  const passwordId = useId();
  const passwordHintId = useId();

  useEffect(() => {
    // Back from Google or GitHub without a session (Better Auth adds
    // ?error=), or from deleting the account (?deleted=1). Show it once,
    // then drop it so a reload starts clean.
    const query = new URLSearchParams(window.location.search);
    const code = query.get("error");
    if (code) setError(socialErrorText(code));
    else if (query.get("deleted") === "1") setNotice("Your account is deleted.");
    else return;
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function social(provider: "google" | "github") {
    setError(null);
    setSocialBusy(provider);
    try {
      // Absolute callback so the post-login redirect lands on this web
      // origin (a relative path would resolve against the API origin).
      await authClient.signIn.social({
        provider,
        // New accounts see the one-time track chooser; established users
        // skip straight to their workspace.
        callbackURL: `${window.location.origin}/track`,
        // A refused sign-in comes back here with ?error= (see above),
        // not to Better Auth's bare error page.
        errorCallbackURL: `${window.location.origin}/signin`,
      });
      // OAuth redirects away; nothing to do on success.
    } catch {
      setSocialBusy(null);
      setError(
        `Could not start ${provider === "google" ? "Google" : "GitHub"} sign-in — is the provider configured on this server?`,
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          name: name.trim() || email,
          email,
          password,
          // Where the confirmation link in the welcome email lands.
          callbackURL: `${window.location.origin}/settings?verified=1`,
        });
        if (res.error) throw new Error(authErrorText(res.error, "Sign-up failed. Try again."));
        // Hard navigation, already reading the fresh session cookie.
        // track is unset for new users, so this lands on the chooser.
        await landOnSideHome();
        return;
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(authErrorText(res.error, "Sign-in failed. Try again."));
        // Hard navigation, already reading the fresh session cookie.
        await landOnSideHome();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const showSocial = GOOGLE_ENABLED || GITHUB_ENABLED;

  return (
    <AuthCard
      title={mode === "signin" ? "Sign in to CandidLens" : "Create your account"}
      description={
        mode === "signin"
          ? "Continue with Google or GitHub, or use your email."
          : EMAIL_ENABLED
            ? "We'll email you a link to confirm your address. You'll create or join an organization next."
            : "You'll create or join an organization next."
      }
    >
      {showSocial && (
        <>
          <div className="flex flex-col gap-2.5">
            {GOOGLE_ENABLED && (
              <Button
                type="button"
                variant="outline"
                className="h-11 text-[0.9rem] font-medium text-[var(--hl-cream)] transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--hl-border)" }}
                disabled={socialBusy !== null}
                onClick={() => social("google")}
              >
                {socialBusy === "google" ? (
                  "Redirecting…"
                ) : (
                  <>
                    <GoogleIcon />
                    Continue with Google
                  </>
                )}
              </Button>
            )}
            {GITHUB_ENABLED && (
              <Button
                type="button"
                variant="outline"
                className="h-11 text-[0.9rem] font-medium text-[var(--hl-cream)] transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--hl-border)" }}
                disabled={socialBusy !== null}
                onClick={() => social("github")}
              >
                {socialBusy === "github" ? (
                  "Redirecting…"
                ) : (
                  <>
                    <GitHubIcon />
                    Continue with GitHub
                  </>
                )}
              </Button>
            )}
          </div>
          <div
            className="my-5 flex items-center gap-3 text-xs"
            style={{ color: "var(--hl-muted)" }}
          >
            <span className="h-px flex-1" style={{ background: "var(--hl-border)" }} />
            or continue with email
            <span className="h-px flex-1" style={{ background: "var(--hl-border)" }} />
          </div>
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {mode === "signup" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span style={{ color: "var(--hl-mist)" }}>Name</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={authInputClass}
              style={authInputStyle}
            />
          </label>
        )}
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
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor={passwordId} style={{ color: "var(--hl-mist)" }}>
            Password
          </label>
          <PasswordInput
            id={passwordId}
            name="password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            aria-describedby={mode === "signup" ? passwordHintId : undefined}
            className={authInputClass}
            style={authInputStyle}
          />
          {mode === "signup" && (
            <p id={passwordHintId} className="text-xs" style={{ color: "var(--hl-muted)" }}>
              At least 8 characters.
            </p>
          )}
          {/* After the field, so Tab still goes from email to password. */}
          {mode === "signin" && EMAIL_ENABLED && (
            <Link href="/forgot-password" className={`self-end text-xs ${authLinkClass}`}>
              Forgot password?
            </Link>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--hl-bad)" }}>
            {error}
          </p>
        )}
        {notice && !error && (
          <p role="status" className="text-sm" style={{ color: "var(--color-success)" }}>
            {notice}
          </p>
        )}

        <Button type="submit" disabled={busy} className={authSubmitClass}>
          {busy
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm" style={{ color: "var(--hl-mist)" }}>
        {mode === "signin" ? "Need an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className={authLinkClass}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </AuthCard>
  );
}
