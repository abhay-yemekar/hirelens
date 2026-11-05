"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@candidlens/ui";
import { useId, useState } from "react";
import { ApiRequestError, accountDeletionPlan, type DeletionPlan, deleteAccount } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";

function names(orgs: Array<{ name: string }>): string {
  return orgs.map((o) => o.name).join(", ");
}

/**
 * Delete account (Settings), for recruiters and candidates alike. Shows
 * what happens to each organization before anything is deleted (see
 * apps/api/src/routes/account-deletion.ts): only-you organizations are
 * erased, shared ones keep their data, and being the only owner of a
 * shared one blocks the deletion until someone else is made an owner.
 */
export function DeleteAccountCard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DeletionPlan | "failed" | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmId = useId();

  async function start() {
    setOpen(true);
    setError(null);
    setPlan(null);
    try {
      const res = await accountDeletionPlan();
      setPlan({ erase: res.erase, leave: res.leave, handOver: res.handOver });
    } catch {
      setPlan("failed");
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(typed.trim());
      // The server already ended every session; this clears the cookie.
      await authClient.signOut().catch(() => {});
      window.location.assign("/signin?deleted=1");
    } catch (err) {
      setBusy(false);
      const code = err instanceof ApiRequestError ? err.code : undefined;
      if (code === "hand_over_ownership") void start();
      setError(err instanceof Error ? err.message : "Couldn't delete the account. Try again.");
    }
  }

  const loaded = plan !== null && plan !== "failed" ? plan : null;
  const blocked = (loaded?.handOver.length ?? 0) > 0;
  const matches = email !== "" && typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Delete account</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Permanently delete your CandidLens account. This can't be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!open ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void start()}
              style={{ color: "var(--color-danger)" }}
            >
              Delete my account…
            </Button>
          </div>
        ) : plan === null ? (
          <p style={{ color: "var(--hl-muted)" }}>Loading…</p>
        ) : plan === "failed" ? (
          <p style={{ color: "var(--color-danger)" }}>
            Couldn't check your organizations. Reload the page to try again.
          </p>
        ) : (
          <form onSubmit={remove} className="flex flex-col gap-4">
            <ul className="flex list-disc flex-col gap-2 pl-5" style={{ color: "var(--hl-mist)" }}>
              <li>
                Your name and email are erased, your password and Google or GitHub links are
                removed, and you're signed out on every device.
              </li>
              {plan.erase.length > 0 && (
                <li>
                  <span style={{ color: "var(--hl-cream)" }}>Erased with your account</span>,
                  because only you are in them, with all their jobs, candidates, resumes and audit
                  log:{" "}
                  <span className="break-words font-medium" style={{ color: "var(--hl-cream)" }}>
                    {names(plan.erase)}
                  </span>
                  .
                </li>
              )}
              {plan.leave.length > 0 && (
                <li>
                  You leave{" "}
                  <span className="break-words font-medium" style={{ color: "var(--hl-cream)" }}>
                    {names(plan.leave)}
                  </span>
                  {plan.leave.length === 1
                    ? "; its data stays with the other members, and API tokens you created there are revoked."
                    : "; their data stays with the other members, and API tokens you created there are revoked."}
                </li>
              )}
            </ul>

            {blocked ? (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                You're the only owner of{" "}
                <span className="break-words font-medium">{names(plan.handOver)}</span>
                {plan.handOver.length === 1
                  ? ", which has other members. Make one of them an owner under Members, then come back."
                  : ", which have other members. In each, make another member an owner under Members, then come back."}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={confirmId} style={{ color: "var(--hl-mist)" }}>
                  Type your email to confirm
                </label>
                <input
                  id={confirmId}
                  type="email"
                  name="confirm-email"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={email}
                  autoComplete="off"
                  spellCheck={false}
                  className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--hl-accent-soft)]"
                  style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                />
                <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
                  For your security, this needs a sign-in within the last 15 minutes.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" style={{ color: "var(--color-danger)" }}>
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {!blocked && (
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={!loaded || !matches || busy}
                >
                  {busy ? "Deleting…" : "Delete my account"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
