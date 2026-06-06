import { NextResponse } from "next/server";
import { createInsforgeServerClient } from "@/lib/insforge-server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const insforge = createInsforgeServerClient();

  const [tourRes, roomsRes] = await Promise.all([
    insforge.database.from("tours").select("*").eq("id", id),
    insforge.database.from("rooms").select("*").eq("tour_id", id).order("display_order", { ascending: true }),
  ]);

  if (tourRes.error || !tourRes.data?.[0]) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  const roomIds = (roomsRes.data ?? []).map((r: { id: string }) => r.id);

  const [hotspotsRes, placementsRes] = await Promise.all([
    roomIds.length
      ? insforge.database.from("hotspots").select("*").in("from_room_id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    roomIds.length
      ? insforge.database.from("placements").select("*").in("room_id", roomIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const rooms = (roomsRes.data ?? []).map((room: { id: string }) => ({
    ...room,
    hotspots: (hotspotsRes.data ?? []).filter((h: { from_room_id: string }) => h.from_room_id === room.id),
    placements: (placementsRes.data ?? []).filter((p: { room_id: string }) => p.room_id === room.id),
  }));

  return NextResponse.json({ ...tourRes.data[0], rooms });
}
