"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@hirelens/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Public candidate portal (Wave 4) — no account, token is the credential.
 * Opt-in only: every field is skippable, nothing is required, and the page
 * states plainly what happens to the answers before the candidate types.
 */
export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<"loading" | "ready" | "submitted" | "gone">("loading");
  const [jobTitle, setJobTitle] = useState("");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/portal/${token}`);
        if (cancelled) return;
        if (res.status === 200) {
          const body = (await res.json()) as { invitation: { jobTitle: string } };
          setJobTitle(body.invitation.jobTitle);
          setState("ready");
        } else if (res.status === 409) {
          setState("submitted");
        } else {
          setState("gone");
        }
      } catch {
        if (!cancelled) setState("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Submit only the fields the candidate actually answered.
      const answers: Array<{ dimension: string; value: string }> = [];
      if (gender) answers.push({ dimension: "gender", value: gender });
      if (ethnicity) answers.push({ dimension: "race_ethnicity", value: ethnicity });
      for (const a of answers) {
        const res = await fetch(`/api/portal/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(a),
        });
        if (res.status === 409) {
          setState("submitted");
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "could_not_submit");
        }
      }
      setState("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "could_not_submit");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          Loading…
        </p>
      </main>
    );
  }

  if (state === "gone") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card
          className="max-w-md"
          style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
        >
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>Link no longer active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              This link was revoked or never existed. If you expected a demographics form, ask your
              recruiter to send a fresh link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (state === "submitted") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card
          className="max-w-md"
          style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}
        >
          <CardHeader>
            <CardTitle style={{ color: "var(--hl-cream)" }}>Thank you</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
              Your response was recorded. It will only ever be used in aggregate statistics — never
              shown with your name. You can close this page.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--hl-mist)" }}
        >
          HireLens · Candidate portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--hl-cream)]">
          Help us keep hiring fair
        </h1>
        {jobTitle ? (
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Application: {jobTitle}
          </p>
        ) : null}
      </header>

      <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: "var(--hl-cream)" }}>
            Before you answer
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6" style={{ color: "var(--color-fg-muted)" }}>
          <p>
            Every question is <strong style={{ color: "var(--hl-cream)" }}>optional</strong> and{" "}
            <strong style={{ color: "var(--hl-cream)" }}>opt-in</strong>. Your answers:
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>never affect your score or evaluation — they are collected separately;</li>
            <li>are used only in aggregate statistics (e.g. the company's bias audit);</li>
            <li>are never shown alongside your name, resume, or scores.</li>
          </ul>
          <p className="mt-2">You may skip everything and simply close this page.</p>
        </CardContent>
      </Card>

      <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
        <CardContent className="flex flex-col gap-5">
          {error ? (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              Something went wrong ({error}). Your answers were not saved — please try again.
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "var(--hl-cream)" }}>
              Gender <span style={{ color: "var(--color-fg-muted)" }}>(optional)</span>
            </span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--hl-border)",
                background: "var(--hl-input)",
                color: "var(--hl-cream)",
              }}
            >
              <option value="">Prefer not to say</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
              <option value="non-binary">Non-binary</option>
              <option value="self-described">Prefer to self-describe</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" style={{ color: "var(--hl-cream)" }}>
              Race / ethnicity <span style={{ color: "var(--color-fg-muted)" }}>(optional)</span>
            </span>
            <select
              value={ethnicity}
              onChange={(e) => setEthnicity(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--hl-border)",
                background: "var(--hl-input)",
                color: "var(--hl-cream)",
              }}
            >
              <option value="">Prefer not to say</option>
              <option value="asian">Asian</option>
              <option value="black">Black or African American</option>
              <option value="hispanic">Hispanic or Latino</option>
              <option value="white">White</option>
              <option value="other">Other</option>
            </select>
          </label>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={submit} disabled={busy || (!gender && !ethnicity)}>
              {busy ? "Submitting…" : "Submit"}
            </Button>
            <Link
              href="/"
              className="text-sm underline-offset-2 hover:underline"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Skip — close this page
            </Link>
          </div>
          {!gender && !ethnicity ? (
            <p className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
              Both fields are skipped — nothing was recorded.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
