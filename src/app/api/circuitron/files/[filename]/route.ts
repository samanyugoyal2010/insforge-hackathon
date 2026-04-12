/**
 * API endpoint for serving Circuitron generated files
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createSupabaseServiceClient } from "@/lib/supabase-service";

const ALLOWED_EXT = new Set([
  ".svg",
  ".kicad_pcb",
  ".kicad_sch",
  ".net",
  ".py",
  ".log",
  ".erc",
  ".sch",
]);

function safeBasename(name: string): string | null {
  const base = path.basename(name);
  if (base !== name || base.length === 0 || base.length > 240) return null;
  if (base.includes("..")) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) return null;
  return base;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename: raw } = await context.params;
    const decoded = safeBasename(
      decodeURIComponent(Array.isArray(raw) ? raw[0] : raw),
    );

    if (!decoded) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const ext = path.extname(decoded).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 },
      );
    }

    const fileDir = path.join(os.tmpdir(), "circuitron-output");
    const filePath = path.join(fileDir, decoded);

    if (!filePath.startsWith(fileDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    let fileContent: Uint8Array | null = null;
    try {
      await fs.access(filePath);
      fileContent = await fs.readFile(filePath);
    } catch {
      const service = createSupabaseServiceClient();
      if (!service) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const { data: row } = await service
        .from("node0_project_artifacts")
        .select("storage_path")
        .eq("public_name", decoded)
        .maybeSingle();
      if (!row?.storage_path) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const { data } = await service.storage
        .from("node0-artifacts")
        .download(row.storage_path);
      if (!data) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      fileContent = new Uint8Array(await data.arrayBuffer());
    }

    let contentType = "application/octet-stream";
    switch (ext) {
      case ".svg":
        contentType = "image/svg+xml";
        break;
      case ".py":
      case ".log":
      case ".net":
      case ".erc":
      case ".sch":
      case ".kicad_sch":
        contentType = "text/plain; charset=utf-8";
        break;
      case ".kicad_pcb":
        contentType = "text/plain; charset=utf-8";
        break;
    }

    const responseBody = Uint8Array.from(fileContent).buffer;
    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${decoded}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving Circuitron file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 },
    );
  }
}
