import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const { from_room_id, to_room_id, theta = 0, phi = 0 } = await req.json();

  if (!from_room_id || !to_room_id) {
    return NextResponse.json({ error: "from_room_id and to_room_id required" }, { status: 400 });
  }

  const insforge = createInsforgeServerClient();
  const { data, error } = await insforge.database
    .from("hotspots")
    .insert([{ from_room_id, to_room_id, theta, phi }])
    .select();

  if (error || !data?.[0]) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json(data[0], { status: 201 });
}
