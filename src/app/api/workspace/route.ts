import { NextResponse } from "next/server";
import { z } from "zod";

import {
  bearerFromRequest,
  createSupabaseForAccessToken,
  getSupabaseEnv,
} from "@/lib/supabase-user";
import { teamIdsForUser } from "@/lib/team-server";

const projectSchema = z.object({
  client_id: z.string().min(1).max(128),
  name: z.string().max(200).default("Untitled"),
  tagline: z.string().max(400).default(""),
  updated_at: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
  pcb_snapshot: z.unknown().nullable().optional(),
  cad_document: z.unknown().nullable().optional(),
  bom: z.unknown().nullable().optional(),
  /** Mock fab orders, tool tab, technical toggles — see workspace-sync */
  extras: z.unknown().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  firmware: z.string().max(2_500_000).nullable().optional(),
  artifact_manifest: z.array(z.unknown()).nullable().optional(),
});

const putBodySchema = z.object({
  projects: z.array(projectSchema).max(80),
});

function isSchemaMissingError(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" || // relation does not exist
    code === "42703" || // undefined column
    msg.includes("node0_workspace_projects") ||
    msg.includes("relation") ||
    msg.includes("column")
  );
}

function sanitizeMessages(input: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const r = item as Record<string, unknown>;
      const role = typeof r.role === "string" ? r.role.slice(0, 32) : "assistant";
      const text = typeof r.text === "string" ? r.text.slice(0, 8000) : "";
      return { role, text };
    })
    .slice(-120);
}

export async function GET(request: Request) {
  try {
    getSupabaseEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseForAccessToken(token);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamIds = await teamIdsForUser(supabase, user.id);
  let q = supabase
    .from("node0_workspace_projects")
    .select(
      "client_id,name,tagline,updated_at,messages,pcb_snapshot,cad_document,bom,extras,team_id,firmware,artifact_manifest,user_id",
    )
    .order("updated_at", { ascending: false });
  if (teamIds.length > 0) {
    q = q.or(`user_id.eq.${user.id},team_id.in.(${teamIds.join(",")})`);
  } else {
    q = q.eq("user_id", user.id);
  }

  const { data, error } = await q;

  if (error) {
    if (isSchemaMissingError(error)) {
      return NextResponse.json({ projects: [], degraded: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] });
}

export async function PUT(request: Request) {
  try {
    getSupabaseEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const raw = JSON.stringify(parsed.data.projects);
  if (raw.length > 4_500_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const supabase = createSupabaseForAccessToken(token);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projects } = parsed.data;
  const clientIds = projects.map((p) => p.client_id);

  if (projects.length > 0) {
    const rows = projects.map((p) => ({
      user_id: user.id,
      client_id: p.client_id,
      name: p.name,
      tagline: p.tagline,
      updated_at: p.updated_at ?? new Date().toISOString(),
      messages: sanitizeMessages(p.messages),
      pcb_snapshot: p.pcb_snapshot ?? null,
      cad_document: p.cad_document ?? null,
      bom: p.bom ?? null,
      extras: p.extras ?? null,
      team_id: p.team_id ?? null,
      firmware: p.firmware ?? null,
      artifact_manifest: p.artifact_manifest ?? null,
    }));

    const { error: upsertErr } = await supabase
      .from("node0_workspace_projects")
      .upsert(rows, { onConflict: "user_id,client_id" });

    if (upsertErr) {
      if (isSchemaMissingError(upsertErr)) {
        return NextResponse.json({ ok: true, degraded: true }, { status: 200 });
      }
      return NextResponse.json(
        {
          error: upsertErr.message,
          code: upsertErr.code ?? null,
          details: upsertErr.details ?? null,
          hint: upsertErr.hint ?? null,
        },
        { status: 500 },
      );
    }
  }

  if (clientIds.length === 0) {
    const { error: delErr } = await supabase
      .from("node0_workspace_projects")
      .delete()
      .eq("user_id", user.id);
    if (delErr) {
      if (isSchemaMissingError(delErr)) {
        return NextResponse.json({ ok: true, degraded: true }, { status: 200 });
      }
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { data: existing, error: selErr } = await supabase
      .from("node0_workspace_projects")
      .select("client_id")
      .eq("user_id", user.id);

    if (selErr) {
      if (isSchemaMissingError(selErr)) {
        return NextResponse.json({ ok: true, degraded: true }, { status: 200 });
      }
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const idSet = new Set(clientIds);
    const stale = (existing ?? [])
      .map((r) => r.client_id as string)
      .filter((id) => !idSet.has(id));

    for (const client_id of stale) {
      const { error: dErr } = await supabase
        .from("node0_workspace_projects")
        .delete()
        .eq("user_id", user.id)
        .eq("client_id", client_id);
      if (dErr) {
        if (isSchemaMissingError(dErr)) {
          return NextResponse.json({ ok: true, degraded: true }, { status: 200 });
        }
        return NextResponse.json({ error: dErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
