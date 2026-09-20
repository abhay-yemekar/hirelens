"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hirelens/ui";
import { useCallback, useEffect, useState } from "react";
import { NoticeBanner } from "@/components/notice-banner";
import { organization, useSession } from "@/lib/auth-client";

const ROLE_OPTIONS = ["recruiter", "hiring_manager", "viewer"] as const;

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  hiring_manager: "Hiring manager",
  recruiter: "Recruiter",
  viewer: "Viewer",
};

interface MemberRow {
  id: string;
  userId: string;
  role: string;
  user: { name?: string; email: string } | null;
}

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
}

function roleOf(m: { role: string | string[] }): string {
  const raw = Array.isArray(m.role) ? m.role[0] : m.role;
  return ((raw ?? "").split(",")[0] ?? "").trim();
}

/**
 * Team management for the active organization: invite teammates with a
 * role, promote/demote, remove. Owner-only actions are gated client-side
 * and enforced server-side by Better Auth.
 */
export function MembersCard() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("recruiter");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await organization.getFullOrganization();
      const data = (res as { data?: FullOrg | null; error?: { message?: string } | null }).data;
      if (res?.error || !data) {
        throw new Error(res?.error?.message ?? "Could not load team members");
      }
      setMembers(data.members ?? []);
      setInvitations((data.invitations ?? []).filter((i) => i.status === "pending"));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  const me = session?.user?.id;
  const myRole = members.find((m) => m.userId === me)?.role ?? "";
  const isOwner = myRole === "owner";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    setNotice(null);
    try {
      // Client SDK types roles from better-auth's defaults; the server
      // accepts our custom hierarchy (validated there), so cast at the edge.
      const res = await organization.inviteMember({
        email: email.trim(),
        role,
      } as unknown as { email: string; role: "member" });
      if (res?.error) throw new Error(res.error.message ?? "Invite failed");
      setNotice(`Invitation sent to ${email.trim()}. They appear here once they accept.`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: MemberRow, next: string) {
    setError(null);
    setNotice(null);
    try {
      const res = await organization.updateMemberRole({
        memberId: member.id,
        role: next,
      });
      if (res?.error) throw new Error(res.error.message ?? "Could not change the role");
      setNotice(`${member.user?.email ?? "Member"} is now ${ROLE_LABEL[next] ?? next}.`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function removeMember(member: MemberRow) {
    const label = member.user?.email ?? "this member";
    if (!window.confirm(`Remove ${label} from the organization? They lose access immediately.`))
      return;
    setError(null);
    setNotice(null);
    try {
      const res = await organization.removeMember({ memberIdOrEmail: member.id });
      if (res?.error) throw new Error(res.error.message ?? "Could not remove the member");
      setNotice(`${label} removed.`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  async function cancelInvite(inv: InvitationRow) {
    setError(null);
    setNotice(null);
    try {
      const res = await organization.cancelInvitation({ invitationId: inv.id });
      if (res?.error) throw new Error(res.error.message ?? "Could not cancel the invitation");
      setNotice(`Invitation to ${inv.email} cancelled.`);
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card style={{ background: "var(--hl-card)", borderColor: "var(--hl-border)" }}>
      <CardHeader>
        <CardTitle style={{ color: "var(--hl-cream)" }}>Members &amp; roles</CardTitle>
        <CardDescription style={{ color: "var(--hl-mist)" }}>
          Owners manage the team. Recruiters and hiring managers see and edit jobs; viewers have
          read-only access. Invitations expire after 48 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? <NoticeBanner error={error} /> : null}
        {notice ? (
          <p className="text-sm" style={{ color: "var(--color-success)" }}>
            ✓ {notice}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--hl-muted)" }}>
            Loading team…
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--hl-border)" }}>
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--hl-cream)]">
                      {m.user?.name || m.user?.email || "Member"}
                      {m.userId === me && (
                        <span className="ml-2 text-xs" style={{ color: "var(--hl-muted)" }}>
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs" style={{ color: "var(--hl-muted)" }}>
                      {m.user?.email}
                    </p>
                  </div>
                  {isOwner && m.userId !== me ? (
                    <>
                      <select
                        aria-label={`Role for ${m.user?.email ?? "member"}`}
                        value={roleOf(m)}
                        onChange={(e) => void changeRole(m, e.target.value)}
                        className="rounded-[var(--radius-control)] border px-2 py-1.5 text-xs text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                        style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeMember(m)}
                        className="text-xs"
                        style={{ color: "var(--color-danger)" }}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: "var(--hl-input)",
                        color: "var(--hl-mist)",
                        border: "1px solid var(--hl-border)",
                      }}
                    >
                      {ROLE_LABEL[roleOf(m)] ?? roleOf(m)}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {invitations.length > 0 && (
              <div className="flex flex-col gap-2">
                <p
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--hl-muted)" }}
                >
                  Pending invitations
                </p>
                <ul className="flex flex-col gap-2">
                  {invitations.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2"
                      style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={{ color: "var(--hl-mist)" }}
                      >
                        {inv.email}
                        <span className="ml-2 text-xs" style={{ color: "var(--hl-muted)" }}>
                          {ROLE_LABEL[inv.role] ?? inv.role}
                        </span>
                      </span>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void cancelInvite(inv)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isOwner && (
              <form
                className="flex flex-wrap items-end gap-3 border-t pt-4"
                style={{ borderColor: "var(--hl-border)" }}
                onSubmit={invite}
              >
                <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
                  <span style={{ color: "var(--hl-mist)" }}>Invite by email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    required
                    className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span style={{ color: "var(--hl-mist)" }}>Role</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}
                    className="rounded-[var(--radius-control)] border px-3 py-2 text-sm text-[var(--hl-cream)] focus:border-[var(--hl-accent)] focus:outline-none"
                    style={{ borderColor: "var(--hl-border)", background: "var(--hl-input)" }}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" disabled={inviting}>
                  {inviting ? "Inviting…" : "Send invite"}
                </Button>
              </form>
            )}
            {!isOwner && !loading && (
              <p className="text-xs" style={{ color: "var(--hl-muted)" }}>
                Only owners can invite teammates or change roles.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface FullOrg {
  id: string;
  name: string;
  members?: MemberRow[];
  invitations?: InvitationRow[];
}
