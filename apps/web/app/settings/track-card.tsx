"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setUserTrack, userTrack, useSession } from "@/lib/auth-client";

/**
 * Account card (Settings) — shows the post-signup track choice and lets
 * the user change it at any time. Switching routes to the other side's
 * home so the change is immediately visible.
 */
export function TrackCard() {
  const router = useRouter();
  const { data: session } = useSession();
  const track = userTrack(session?.user);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function switchTo(next: "recruiter" | "candidate") {
    if (next === track || busy) return;
    setBusy(true);
    setDone(false);
    try {
      await setUserTrack(next);
      setDone(true);
      // Route to the newly chosen side so the switch is visible.
      router.push(next === "candidate" ? "/candidate" : "/jobs");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const label =
    track === "candidate" ? "Candidate" : track === "recruiter" ? "Recruiter" : "Not chosen yet";

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Account</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Which side of hiring you use HireLens from — controls where sign-in lands you. You can
          switch anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--hl-mist)" }}>
          Current side:{" "}
          <span className="font-semibold" style={{ color: "var(--hl-cream)" }}>
            {label}
          </span>
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant={track === "recruiter" ? "primary" : "outline"}
            disabled={busy || track === "recruiter"}
            onClick={() => switchTo("recruiter")}
            style={
              track === "recruiter"
                ? { background: "var(--hl-accent)", color: "var(--hl-ink)" }
                : { borderColor: "var(--hl-border)", color: "var(--hl-cream)" }
            }
          >
            {track === "recruiter" ? "✓ Recruiter side" : "Switch to recruiter"}
          </Button>
          <Button
            variant={track === "candidate" ? "primary" : "outline"}
            disabled={busy || track === "candidate"}
            onClick={() => switchTo("candidate")}
            style={
              track === "candidate"
                ? { background: "var(--hl-accent)", color: "var(--hl-ink)" }
                : { borderColor: "var(--hl-border)", color: "var(--hl-cream)" }
            }
          >
            {track === "candidate" ? "✓ Candidate side" : "Switch to candidate"}
          </Button>
        </div>
        {done ? (
          <span className="text-sm" style={{ color: "var(--color-success)" }}>
            ✓ Saved — taking you there…
          </span>
        ) : null}
        {track === null ? (
          <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
            Pick a side to control your post-signin landing page.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
