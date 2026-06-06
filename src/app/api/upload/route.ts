import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

const BUCKET = process.env.INSFORGE_STORAGE_BUCKET ?? "tour-panoramas";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;

  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.storage.from(BUCKET).upload(path, file);

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Upload failed" }, { status: 500 });

  return NextResponse.json({ url: data.url }, { status: 201 });
}
