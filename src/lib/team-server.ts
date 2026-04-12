import { createSupabaseForAccessToken } from "@/lib/supabase-user";

export async function getAuthedUser(request: Request) {
  const h = request.headers.get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return { token: null, supabase: null, user: null } as const;
  const supabase = createSupabaseForAccessToken(token);
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  return { token, supabase, user } as const;
}

export async function teamIdsForUser(
  supabase: ReturnType<typeof createSupabaseForAccessToken>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("node0_team_members")
    .select("team_id")
    .eq("user_id", userId);
  return (data ?? [])
    .map((r) => (typeof r.team_id === "string" ? r.team_id : null))
    .filter((v): v is string => Boolean(v));
}
