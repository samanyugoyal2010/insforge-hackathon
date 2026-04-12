import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { getAuthedUser, teamIdsForUser } from "@/lib/team-server";

const uploadBodySchema = z.object({
  client_id: z.string().min(1).max(128),
  files: z.record(z.string(), z.string()).default({}),
  team_id: z.string().uuid().nullable().optional(),
});

function contentTypeFor(name: string) {
  const low = name.toLowerCase();
  if (low.endsWith(".svg")) return "image/svg+xml";
  if (
    low.endsWith(".kicad_pcb") ||
    low.endsWith(".kicad_sch") ||
    low.endsWith(".sch") ||
    low.endsWith(".net") ||
    low.endsWith(".py") ||
    low.endsWith(".erc") ||
    low.endsWith(".txt")
  ) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

function safeObjectPath(userId: string, clientId: string, fileName: string) {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._/-]/g, "_");
  const now = Date.now();
  return `${userId}/${clientId}/${now}-${cleaned.slice(-120)}`;
}

/**
 * Same visibility as GET /api/workspace: row is visible if owned by user or
 * team_id is in the user's teams. Single query avoids mismatch with RLS/list.
 */
async function assertCanAccessProject(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthedUser>>["supabase"]>,
  userId: string,
  clientId: string,
): Promise<boolean> {
  const teamIds = await teamIdsForUser(supabase, userId);
  let q = supabase
    .from("node0_workspace_projects")
    .select("client_id")
    .eq("client_id", clientId);
  if (teamIds.length > 0) {
    q = q.or(`user_id.eq.${userId},team_id.in.(${teamIds.join(",")})`);
  } else {
    q = q.eq("user_id", userId);
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[artifacts] access check query error:", error.message, {
        clientId,
        userId,
      });
    }
    return false;
  }
  if (!data && process.env.NODE_ENV === "development") {
    console.warn("[artifacts] access denied (no matching workspace row)", {
      clientId,
      userId,
      teamCount: teamIds.length,
    });
  }
  return Boolean(data);
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id")?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }
  const ok = await assertCanAccessProject(supabase, user.id, clientId);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: artifacts, error } = await supabase
    .from("node0_project_artifacts")
    .select("id,kind,storage_path,public_name,size_bytes,content_type,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const service = createSupabaseServiceClient();
  if (!service) {
    return NextResponse.json({ error: "Missing service role key" }, { status: 500 });
  }

  const seen = new Set<string>();
  const files: Record<string, string> = {};
  for (const row of artifacts ?? []) {
    const name = typeof row.kind === "string" ? row.kind : row.public_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const { data } = await service.storage
      .from("node0-artifacts")
      .download(String(row.storage_path));
    if (!data) continue;
    const text = await data.text();
    files[name] = text;
  }

  return NextResponse.json({
    files,
    artifacts: artifacts ?? [],
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthedUser(request);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = uploadBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { client_id, files } = parsed.data;
  const canAccess = await assertCanAccessProject(supabase, user.id, client_id);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const service = createSupabaseServiceClient();
  if (!service) {
    return NextResponse.json({ error: "Missing service role key" }, { status: 500 });
  }

  const entries = Object.entries(files).slice(0, 80);
  const rows: Array<{
    user_id: string;
    team_id: string | null;
    client_id: string;
    kind: string;
    storage_path: string;
    public_name: string;
    size_bytes: number;
    content_type: string;
  }> = [];

  for (const [kind, content] of entries) {
    if (typeof content !== "string") continue;
    const size = Buffer.byteLength(content, "utf-8");
    if (size > 3_500_000) continue;
    const objectPath = safeObjectPath(user.id, client_id, kind);
    const contentType = contentTypeFor(kind);
    const blob = new Blob([content], { type: contentType });
    const { error: upErr } = await service.storage
      .from("node0-artifacts")
      .upload(objectPath, blob, {
        contentType,
        upsert: false,
      });
    if (upErr) continue;
    rows.push({
      user_id: user.id,
      team_id: parsed.data.team_id ?? null,
      client_id,
      kind,
      storage_path: objectPath,
      public_name: `${client_id}-${kind}`.slice(0, 220),
      size_bytes: size,
      content_type: contentType,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ artifacts: [] });
  }

  const { data, error } = await supabase
    .from("node0_project_artifacts")
    .insert(rows)
    .select("id,kind,storage_path,public_name,size_bytes,content_type,created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ artifacts: data ?? [] });
}
