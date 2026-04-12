import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/team-server";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("node0_team_members")
    .select("role,node0_teams(id,name,created_at)")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const teams = (data ?? [])
    .map((row) => {
      const t = Array.isArray(row.node0_teams) ? row.node0_teams[0] : row.node0_teams;
      if (!t || typeof t !== "object") return null;
      return {
        id: (t as { id?: string }).id ?? "",
        name: (t as { name?: string }).name ?? "Team",
        createdAt: (t as { created_at?: string }).created_at ?? null,
        role: typeof row.role === "string" ? row.role : "viewer",
      };
    })
    .filter((x): x is { id: string; name: string; createdAt: string | null; role: string } => Boolean(x && x.id));

  return NextResponse.json({ teams });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: team, error: teamErr } = await supabase
    .from("node0_teams")
    .insert({ name: parsed.data.name, created_by: user.id })
    .select("id,name,created_at")
    .single();
  if (teamErr || !team) {
    return NextResponse.json({ error: teamErr?.message ?? "Failed to create team" }, { status: 500 });
  }

  const { error: memberErr } = await supabase.from("node0_team_members").insert({
    team_id: team.id,
    user_id: user.id,
    role: "owner",
  });
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      createdAt: team.created_at,
      role: "owner",
    },
  });
}
