import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser } from "@/lib/team-server";

const actionSchema = z.object({
  inviteId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export async function GET(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = user.email?.toLowerCase();
  if (!email) return NextResponse.json({ invites: [] });

  const { data, error } = await supabase
    .from("node0_team_invites")
    .select("id,team_id,email,status,created_at,node0_teams(name)")
    .eq("status", "pending")
    .eq("email", email)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = user.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "No account email" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: invite, error: invErr } = await supabase
    .from("node0_team_invites")
    .select("id,team_id,email,status")
    .eq("id", parsed.data.inviteId)
    .eq("email", email)
    .maybeSingle();
  if (invErr || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (parsed.data.action === "accept") {
    const { error: memberErr } = await supabase.from("node0_team_members").upsert(
      {
        team_id: invite.team_id,
        user_id: user.id,
        role: "editor",
      },
      { onConflict: "team_id,user_id" },
    );
    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    const { error: updErr } = await supabase
      .from("node0_team_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    const { error: updErr } = await supabase
      .from("node0_team_invites")
      .update({ status: "revoked" })
      .eq("id", invite.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
