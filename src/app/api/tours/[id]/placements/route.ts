import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const { room_id, placements } = await req.json();

  if (!room_id || !Array.isArray(placements)) {
    return NextResponse.json({ error: "room_id and placements[] required" }, { status: 400 });
  }

  const insforge = createInsforgeServerClient();

  await insforge.database.from("placements").delete().eq("room_id", room_id);

  if (placements.length === 0) return NextResponse.json({ ok: true });

  const rows = placements.map((p: {
    model_id: string;
    position_x: number;
    position_y: number;
    position_z: number;
    rotation_y: number;
  }) => ({
    room_id,
    model_id: p.model_id,
    position_x: p.position_x,
    position_y: p.position_y,
    position_z: p.position_z,
    rotation_y: p.rotation_y ?? 0,
  }));

  const { error } = await insforge.database.from("placements").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
