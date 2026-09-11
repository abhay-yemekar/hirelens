"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
