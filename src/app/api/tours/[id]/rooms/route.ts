import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tour_id } = await params;
  const { name, photo_url, display_order } = await req.json();

  if (!name || !photo_url) {
    return NextResponse.json({ error: "name and photo_url required" }, { status: 400 });
  }

  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.database
    .from("rooms")
    .insert([{ tour_id, name, photo_url, display_order: display_order ?? 0 }])
    .select();

  if (error || !data?.[0]) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json(data[0], { status: 201 });
}
