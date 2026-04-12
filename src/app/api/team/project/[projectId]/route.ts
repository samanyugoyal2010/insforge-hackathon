import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/team-server";

const bodySchema = z.object({
  action: z.enum(["invite", "revoke_invite", "assign_team"]),
  email: z.string().email().optional(),
  inviteId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  teamName: z.string().trim().min(1).max(80).optional(),
});

async function loadProject(
  supabase: any,
  userId: string,
  projectId: string,
) {
  const { data: own } = await supabase
    .from("node0_workspace_projects")
    .select("user_id,client_id,team_id,name")
    .eq("client_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (own) return own;

  const { data: shared } = await supabase
    .from("node0_workspace_projects")
    .select("user_id,client_id,team_id,name")
    .eq("client_id", projectId)
    .limit(1)
    .maybeSingle();
  return shared ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await context.params;
  const project = await loadProject(supabase, user.id, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const teamId = typeof project.team_id === "string" ? project.team_id : null;
  if (!teamId) return NextResponse.json({ team: null, members: [], invites: [] });

  const [{ data: team }, { data: members }, { data: invites }] = await Promise.all([
    supabase.from("node0_teams").select("id,name,created_at").eq("id", teamId).maybeSingle(),
    supabase
      .from("node0_team_members")
      .select("user_id,role,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    supabase
      .from("node0_team_invites")
      .select("id,email,status,created_at")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    team,
    members: members ?? [],
    invites: invites ?? [],
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { projectId } = await context.params;
  const project = await loadProject(supabase, user.id, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let teamId = typeof project.team_id === "string" ? project.team_id : null;

  if (parsed.data.action === "assign_team") {
    const chosen = parsed.data.teamId;
    if (!chosen) {
      const name = parsed.data.teamName || `${project.name ?? "Project"} Team`;
      const { data: team, error: tErr } = await supabase
        .from("node0_teams")
        .insert({ name, created_by: user.id })
        .select("id")
        .single();
      if (tErr || !team) {
        return NextResponse.json({ error: tErr?.message ?? "Failed to create team" }, { status: 500 });
      }
      const { error: mErr } = await supabase.from("node0_team_members").insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      });
      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
      teamId = team.id;
    } else {
      teamId = chosen;
    }

    const { error: pErr } = await supabase
      .from("node0_workspace_projects")
      .update({ team_id: teamId })
      .eq("client_id", projectId)
      .eq("user_id", project.user_id);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, teamId });
  }

  if (!teamId) {
    return NextResponse.json(
      { error: "Project has no team yet. Assign a team first." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "invite") {
    const email = parsed.data.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const { error } = await supabase.from("node0_team_invites").insert({
      team_id: teamId,
      email,
      invited_by: user.id,
      status: "pending",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "revoke_invite") {
    const inviteId = parsed.data.inviteId;
    if (!inviteId) {
      return NextResponse.json({ error: "Invite id is required" }, { status: 400 });
    }
    const { error } = await supabase
      .from("node0_team_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("team_id", teamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
