import { gunzipSync, gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AR_HANDOFF_MAX_UNCOMPRESSED_BYTES,
  assertHandoffPayloadUnderCap,
  circuitronForArHandoff,
} from "@/lib/ar-handoff-payload";
import { HANDOFF_GZIP_CONTENT_TYPE } from "@/lib/ar-handoff-transport";
import { parseCadDocumentUnknown } from "@/lib/cad-document";
import { serverCompileOpenscadToStlBase64 } from "@/lib/openscad-server-render";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import {
  bearerFromRequest,
  createSupabaseForAccessToken,
  getSupabaseEnv,
} from "@/lib/supabase-user";

const postBodySchema = z.object({
  cad: z.unknown(),
  circuitron: z.unknown().optional(),
});

const HANDOFF_TTL_MS = 60 * 60 * 1000;

const AR_HANDOFF_BUCKET = "node0_ar_handoffs";

function newHandoffId(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function createAnonSupabase() {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or key");
  return createClient(url, key);
}

/** PostgREST jsonb param must be a JSON object/array at root. */
function asJsonbRpcArg(v: unknown): object {
  if (v !== null && typeof v === "object") return v as object;
  return {};
}

function isMissingRpcError(e: { code?: string; message?: string } | null) {
  if (!e) return false;
  const m = (e.message ?? "").toLowerCase();
  return (
    e.code === "PGRST202" ||
    m.includes("could not find the function") ||
    (m.includes("node0_create_ar_handoff") && m.includes("does not exist")) ||
    (m.includes("node0_fetch_ar_handoff") && m.includes("does not exist"))
  );
}

export async function POST(request: Request) {
  try {
    getSupabaseEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const token = bearerFromRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", error_code: "no_token" },
      { status: 401 },
    );
  }

  const supabase = createSupabaseForAccessToken(token);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json(
      { error: "Unauthorized", error_code: "invalid_token" },
      { status: 401 },
    );
  }

  const ct = request.headers.get("content-type") ?? "";
  let body: unknown;
  try {
    if (ct.includes(HANDOFF_GZIP_CONTENT_TYPE)) {
      const raw = Buffer.from(await request.arrayBuffer());
      let jsonText: string;
      try {
        jsonText = gunzipSync(raw).toString("utf8");
      } catch {
        return NextResponse.json(
          { error: "Invalid gzip handoff body" },
          { status: 400 },
        );
      }
      body = JSON.parse(jsonText) as unknown;
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const cadDoc = parseCadDocumentUnknown(parsed.data.cad);
  if (!cadDoc) {
    return NextResponse.json({ error: "Invalid cad document" }, { status: 400 });
  }

  const circuitSnap = circuitronForArHandoff(parsed.data.circuitron);

  let preRenderedStlBase64: string | null = null;
  const oscCode = cadDoc.openscad?.code?.trim();
  if (oscCode) {
    try {
      preRenderedStlBase64 = await serverCompileOpenscadToStlBase64(oscCode);
    } catch {
      /* best-effort — mobile falls back to CSG */
    }
  }

  const payload: { cad: unknown; circuitron: unknown; preRenderedStlBase64?: string } = {
    cad: cadDoc,
    circuitron: circuitSnap,
  };
  if (preRenderedStlBase64) {
    payload.preRenderedStlBase64 = preRenderedStlBase64;
  }

  try {
    assertHandoffPayloadUnderCap(payload);
  } catch (e) {
    if (
      e instanceof Error &&
      (e as Error & { code?: string }).code === "PAYLOAD_TOO_LARGE"
    ) {
      return NextResponse.json(
        {
          error: `Handoff exceeds ${Math.round(AR_HANDOFF_MAX_UNCOMPRESSED_BYTES / (1024 * 1024))} MiB uncompressed. Split the project or contact support.`,
        },
        { status: 413 },
      );
    }
    throw e;
  }

  const svc = createSupabaseServiceClient();
  if (svc) {
    const id = newHandoffId();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
    const path = `v1/${id}.json.gz`;
    const json = JSON.stringify(payload);
    const compressed = gzipSync(Buffer.from(json, "utf8"));

    const { error: upErr } = await svc.storage
      .from(AR_HANDOFF_BUCKET)
      .upload(path, compressed, {
        contentType: "application/gzip",
        upsert: false,
      });

    if (!upErr) {
      const { error: insErr } = await svc.from("node0_ar_handoffs").insert({
        id,
        payload: null,
        storage_path: path,
        expires_at: expiresAt,
        created_by: user.id,
      });

      if (!insErr) {
        return NextResponse.json({ id, expiresAt });
      }

      await svc.storage.from(AR_HANDOFF_BUCKET).remove([path]).catch(() => {});

      const missingCol =
        insErr.message?.toLowerCase().includes("storage_path") ||
        insErr.message?.toLowerCase().includes("payload");
      if (!missingCol) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }
  }

  const { data: rpcRow, error: rpcErr } = await supabase.rpc(
    "node0_create_ar_handoff",
    {
      p_cad: cadDoc as unknown as Record<string, unknown>,
      p_circuit: asJsonbRpcArg(circuitSnap),
    },
  );

  if (!rpcErr && rpcRow && typeof rpcRow === "object") {
    const row = rpcRow as { id?: string; expiresAt?: string };
    if (typeof row.id === "string") {
      return NextResponse.json({
        id: row.id,
        expiresAt:
          typeof row.expiresAt === "string"
            ? row.expiresAt
            : (row.expiresAt as unknown as string) ?? null,
      });
    }
  }

  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    if (/not authenticated/i.test(msg)) {
      return NextResponse.json(
        { error: "Unauthorized", error_code: "invalid_token" },
        { status: 401 },
      );
    }
    if (/payload too large/i.test(msg)) {
      return NextResponse.json(
        {
          error: `Handoff exceeds DB limit (${Math.round(AR_HANDOFF_MAX_UNCOMPRESSED_BYTES / (1024 * 1024))} MiB). Set SUPABASE_SERVICE_ROLE_KEY and apply migration 20260413160000_node0_ar_handoffs_storage.sql for file storage, or trim the project.`,
        },
        { status: 413 },
      );
    }
  }

  if (!isMissingRpcError(rpcErr)) {
    const hint =
      rpcErr?.message ??
      "Handoff RPC failed. Apply migration 20260412100000_node0_ar_handoff_rpc.sql.";
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  const svcFallback = svc ?? createSupabaseServiceClient();
  if (!svcFallback) {
    return NextResponse.json(
      {
        error:
          "Apply Supabase migration node0_ar_handoff_rpc.sql (Dashboard → SQL), or set SUPABASE_SERVICE_ROLE_KEY for storage-backed handoffs.",
      },
      { status: 503 },
    );
  }

  const id = newHandoffId();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();

  const { error: insErr } = await svcFallback.from("node0_ar_handoffs").insert({
    id,
    payload,
    expires_at: expiresAt,
    created_by: user.id,
  });

  if (insErr) {
    const missing =
      insErr.code === "42P01" ||
      (insErr.message ?? "").toLowerCase().includes("node0_ar_handoffs");
    if (missing) {
      return NextResponse.json(
        {
          error:
            "AR handoffs table missing. Apply Supabase migrations for node0_ar_handoffs.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    id,
    expiresAt,
  });
}

export async function GET(request: Request) {
  let anon;
  try {
    anon = createAnonSupabase();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Config error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id || id.length > 128) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const { data: rpcPayload, error: rpcErr } = await anon.rpc(
    "node0_fetch_ar_handoff",
    { p_id: id },
  );

  if (!rpcErr) {
    if (rpcPayload == null) {
      return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
    }
    if (typeof rpcPayload === "object") {
      const p = rpcPayload as { cad?: unknown; circuitron?: unknown; preRenderedStlBase64?: string };
      return NextResponse.json({
        cad: p.cad ?? null,
        circuitron: p.circuitron ?? {},
        ...(p.preRenderedStlBase64 ? { preRenderedStlBase64: p.preRenderedStlBase64 } : {}),
      });
    }
  }

  if (rpcErr && !isMissingRpcError(rpcErr)) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const svc = createSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json(
      {
        error:
          "Apply Supabase migration node0_ar_handoff_rpc.sql, or set SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const { data, error } = await svc
    .from("node0_ar_handoffs")
    .select("payload,storage_path,expires_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }

  const exp = new Date(String(data.expires_at)).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    const sp = data.storage_path as string | null;
    if (sp) {
      await svc.storage.from(AR_HANDOFF_BUCKET).remove([sp]).catch(() => {});
    }
    await svc.from("node0_ar_handoffs").delete().eq("id", id);
    return NextResponse.json({ error: "Not found or expired" }, { status: 404 });
  }

  const storagePath =
    typeof data.storage_path === "string" && data.storage_path.length > 0
      ? data.storage_path
      : null;

  if (storagePath) {
    const { data: fileBlob, error: dlErr } = await svc.storage
      .from(AR_HANDOFF_BUCKET)
      .download(storagePath);

    if (dlErr || !fileBlob) {
      return NextResponse.json(
        { error: dlErr?.message ?? "Handoff file missing" },
        { status: 502 },
      );
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await fileBlob.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "Handoff file read failed" }, { status: 502 });
    }

    let text: string;
    try {
      text = gunzipSync(buf).toString("utf8");
    } catch {
      try {
        text = buf.toString("utf8");
      } catch {
        return NextResponse.json({ error: "Invalid handoff encoding" }, { status: 502 });
      }
    }

    let parsed: { cad?: unknown; circuitron?: unknown; preRenderedStlBase64?: string };
    try {
      parsed = JSON.parse(text) as { cad?: unknown; circuitron?: unknown; preRenderedStlBase64?: string };
    } catch {
      return NextResponse.json({ error: "Invalid handoff JSON" }, { status: 502 });
    }

    return NextResponse.json({
      cad: parsed.cad ?? null,
      circuitron: parsed.circuitron ?? {},
      ...(parsed.preRenderedStlBase64 ? { preRenderedStlBase64: parsed.preRenderedStlBase64 } : {}),
    });
  }

  const inline = data.payload as { cad?: unknown; circuitron?: unknown; preRenderedStlBase64?: string } | null;
  if (!inline) {
    return NextResponse.json(
      {
        error:
          "Handoff has no payload. Set SUPABASE_SERVICE_ROLE_KEY on the server and apply migration 20260413160000_node0_ar_handoffs_storage.sql.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    cad: inline.cad ?? null,
    circuitron: inline.circuitron ?? {},
    ...(inline.preRenderedStlBase64 ? { preRenderedStlBase64: inline.preRenderedStlBase64 } : {}),
  });
}
