import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

const BUCKET = "node0_quicklook";
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Hosts a USDZ at a real https://…/*.usdz URL so iOS AR Quick Look applies
 * URL-hash banner params (#callToAction, etc.). Blob URLs often skip the banner.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Quick Look hosting unavailable (no service client)", code: "NO_HOST" },
      { status: 503 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Invalid or empty body" }, { status: 400 });
  }

  const id = randomUUID();
  const path = `q/${id}.usdz`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: "model/vnd.usdz+zip",
    cacheControl: "120",
    upsert: false,
  });

  if (error) {
    console.error("[ar-quicklook-usdz] upload", error.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const url = `${baseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  return NextResponse.json({ url });
}
