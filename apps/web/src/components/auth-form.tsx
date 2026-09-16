"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

/**
 * Which social providers the *client* should render. The server decides
 * reality (packages/db/auth.config.ts enables a provider only when both
 * its env vars are set); these NEXT_PUBLIC flags keep the UI honest for
 * the current deployment. Empty => button hidden.
 */
const GOOGLE_ENABLED = process.env["NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED"] === "true";
const GITHUB_ENABLED = process.env["NEXT_PUBLIC_GITHUB_OAUTH_ENABLED"] === "true";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<"google" | "github" | null>(null);

  async function social(provider: "google" | "github") {
    setError(null);
    setSocialBusy(provider);
    try {
      // Absolute callback so the post-login redirect lands on this web
      // origin (a relative path would resolve against the API origin).
      await authClient.signIn.social({
        provider,
        callbackURL: `${window.location.origin}/jobs`,
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
        });
        if (res.error) throw new Error(res.error.message ?? "Sign-up failed");
        router.push("/welcome");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign-in failed");
        router.push("/jobs");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const showSocial = GOOGLE_ENABLED || GITHUB_ENABLED;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "signin" ? "Sign in to HireLens" : "Create your account"}</CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Use your HireLens credentials."
            : "You'll create or join an organization next."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showSocial && (
          <>
            <div className="flex flex-col gap-2">
              {GOOGLE_ENABLED && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={socialBusy !== null}
                  onClick={() => social("google")}
                >
                  {socialBusy === "google" ? "Redirecting…" : "Continue with Google"}
                </Button>
              )}
              {GITHUB_ENABLED && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={socialBusy !== null}
                  onClick={() => social("github")}
                >
                  {socialBusy === "github" ? "Redirecting…" : "Continue with GitHub"}
                </Button>
              )}
            </div>
            <div
              className="my-4 flex items-center gap-3 text-xs"
              style={{ color: "var(--color-fg-muted)" }}
            >
              <span className="h-px flex-1" style={{ background: "var(--color-border-subtle)" }} />
              or continue with email
              <span className="h-px flex-1" style={{ background: "var(--color-border-subtle)" }} />
            </div>
          </>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--color-fg-muted)" }}>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="rounded-[var(--radius-control)] border px-3 py-2"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  background: "var(--color-surface-raised)",
                }}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-fg-muted)" }}>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="rounded-[var(--radius-control)] border px-3 py-2"
              style={{
                borderColor: "var(--color-border-subtle)",
                background: "var(--color-surface-raised)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: "var(--color-fg-muted)" }}>Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="rounded-[var(--radius-control)] border px-3 py-2"
              style={{
                borderColor: "var(--color-border-subtle)",
                background: "var(--color-surface-raised)",
              }}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
