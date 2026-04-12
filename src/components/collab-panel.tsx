"use client";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

type CollabPanelProps = {
  projectId: string | null;
  projectName?: string;
  className?: string;
  onTeamAssigned?: (teamId: string) => void;
};

type PendingInvite = {
  id: string;
  email: string;
  created_at: string;
  status: string;
};
type TeamMember = { user_id: string; role: string; created_at: string };
type TeamData = { id: string; name: string; created_at?: string };
type MyInvite = {
  id: string;
  team_id: string;
  email: string;
  status: string;
  created_at: string;
  node0_teams?: { name?: string } | { name?: string }[];
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CollabPanel({
  projectId,
  projectName,
  className,
  onTeamAssigned,
}: CollabPanelProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [myInvites, setMyInvites] = useState<MyInvite[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailState = useMemo(() => {
    if (!inviteEmail.trim()) return "idle" as const;
    return isValidEmail(inviteEmail) ? "valid" : "invalid";
  }, [inviteEmail]);

  const canInvite = Boolean(projectId) && emailState === "valid";
  const withAuthHeaders = useCallback(async () => {
    const session = await getSession();
    if (!session?.access_token) throw new Error("Missing auth session.");
    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const headers = await withAuthHeaders();
      const [projRes, invRes] = await Promise.all([
        fetch(`/api/team/project/${encodeURIComponent(projectId)}`, {
          method: "GET",
          headers,
        }),
        fetch("/api/team/invites", { method: "GET", headers }),
      ]);
      const projData = (await projRes.json()) as {
        team?: TeamData | null;
        members?: TeamMember[];
        invites?: PendingInvite[];
        error?: string;
      };
      const myData = (await invRes.json()) as { invites?: MyInvite[] };
      if (!projRes.ok) throw new Error(projData.error || "Team fetch failed");
      setTeam(projData.team ?? null);
      setMembers(Array.isArray(projData.members) ? projData.members : []);
      setInvites(Array.isArray(projData.invites) ? projData.invites : []);
      setMyInvites(Array.isArray(myData.invites) ? myData.invites : []);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }, [projectId, withAuthHeaders]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const invitePrepared = async () => {
    if (!canInvite) return;
    if (!projectId) return;
    setBusy(true);
    const email = inviteEmail.trim().toLowerCase();
    try {
      const headers = {
        ...(await withAuthHeaders()),
        "Content-Type": "application/json",
      };
      if (!team) {
        const assignRes = await fetch(
          `/api/team/project/${encodeURIComponent(projectId)}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "assign_team",
              teamName: `${projectName?.trim() || "Node0"} Team`,
            }),
          },
        );
        if (!assignRes.ok) {
          const d = (await assignRes.json()) as { error?: string };
          throw new Error(d.error || "Failed to create team");
        }
        const assigned = (await assignRes.json().catch(() => null)) as
          | { teamId?: string }
          | null;
        if (assigned?.teamId) onTeamAssigned?.(assigned.teamId);
      }
      const res = await fetch(`/api/team/project/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "invite", email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Invite failed");
      setFeedback(`Invite sent to ${email}.`);
      setInviteEmail("");
      await reload();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const headers = {
        ...(await withAuthHeaders()),
        "Content-Type": "application/json",
      };
      const res = await fetch(`/api/team/project/${encodeURIComponent(projectId)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "assign_team",
          teamName: `${projectName?.trim() || "Node0"} Team`,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create team");
      const assigned = data as { teamId?: string };
      if (assigned.teamId) onTeamAssigned?.(assigned.teamId);
      setFeedback("Team created for this project.");
      await reload();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setBusy(false);
    }
  };

  const respondToInvite = async (inviteId: string, action: "accept" | "decline") => {
    setBusy(true);
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: {
          ...(await withAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inviteId, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Action failed");
      setFeedback(action === "accept" ? "Invite accepted." : "Invite declined.");
      await reload();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to update invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-[#070709]", className)}>
      <div className="flex flex-col gap-2 border-b border-white/[0.06] px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-heading text-base font-semibold text-zinc-100 sm:text-lg">
            Team collaboration
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Invite editors to {projectName?.trim() || "this board"} by email.
          </p>
        </div>
      </div>

      {feedback ? (
        <div className="border-b border-white/[0.06] bg-zinc-900/80 px-4 py-2 text-center text-xs text-zinc-300 sm:px-6">
          {feedback}
        </div>
      ) : null}

      <div className="border-b border-white/[0.06] bg-zinc-950/40 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label
              htmlFor="collab-email-invite"
              className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500"
            >
              Invite editor by email
            </label>
            <input
              id="collab-email-invite"
              type="email"
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                if (feedback) setFeedback(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") invitePrepared();
              }}
              className={cn(
                "w-full rounded border bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1",
                emailState === "invalid"
                  ? "border-red-500/70 focus:border-red-400 focus:ring-red-400/30"
                  : "border-zinc-700/90 focus:border-zinc-400 focus:ring-zinc-500/40",
              )}
            />
            <p
              className={cn(
                "text-[10px]",
                emailState === "invalid"
                  ? "text-red-300"
                  : emailState === "valid"
                    ? "text-emerald-300"
                    : "text-zinc-500",
              )}
            >
              {emailState === "invalid"
                ? "Use a valid email format to prepare invite."
                : emailState === "valid"
                  ? "Email format looks good."
                  : team
                    ? `Invites go to team: ${team.name}`
                    : "Create a team for this project, then invite collaborators."}
            </p>
          </div>
          <div className="flex flex-none flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-transparent">
              Action
            </span>
            <Button
              type="button"
              size="sm"
              className="h-9 border border-zinc-600/90 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
              onClick={() => void invitePrepared()}
              disabled={!canInvite || busy || loading}
            >
              Invite
            </Button>
            {!team ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-zinc-700/90 bg-zinc-950 text-zinc-200 hover:bg-zinc-900"
                onClick={() => void createTeam()}
                disabled={busy || loading || !projectId}
              >
                Create team
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {myInvites.length > 0 ? (
          <section className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-heading text-sm font-semibold text-zinc-100">
                Your pending invites
              </h3>
            </div>
            <ul className="space-y-2.5">
              {myInvites.map((invite) => (
                <li key={invite.id} className="rounded-lg border border-white/[0.05] bg-zinc-900/65 p-2.5">
                  <p className="text-sm text-zinc-100">
                    {(Array.isArray(invite.node0_teams)
                      ? invite.node0_teams[0]?.name
                      : invite.node0_teams?.name) ?? "Team"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 border border-zinc-600/90 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                      onClick={() => void respondToInvite(invite.id, "accept")}
                      disabled={busy}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-700/90 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                      onClick={() => void respondToInvite(invite.id, "decline")}
                      disabled={busy}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold text-zinc-100">
              Team members
            </h3>
            <span className="rounded-full border border-white/[0.08] bg-zinc-900/70 px-2 py-0.5 text-[10px] text-zinc-400">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No team members yet.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {members.map((member) => (
                <li
                  key={member.user_id}
                  className="rounded-lg border border-white/[0.05] bg-zinc-900/65 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{member.user_id}</p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-amber-400/30 bg-amber-500/12 px-2 py-1 text-[10px] text-amber-200">
                      {member.role}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-semibold text-zinc-100">
              Pending team invites
            </h3>
            <span className="rounded-full border border-white/[0.08] bg-zinc-900/70 px-2 py-0.5 text-[10px] text-zinc-400">
              {invites.length} pending
            </span>
          </div>
          {invites.length === 0 ? (
            <p className="text-sm text-zinc-500">No pending invites.</p>
          ) : (
            <ul className="space-y-2.5">
              {invites.map((invite) => (
                <li key={invite.id} className="rounded-lg border border-white/[0.05] bg-zinc-900/65 p-2.5">
                  <p className="truncate text-sm text-zinc-100">{invite.email}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Invited {new Date(invite.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
