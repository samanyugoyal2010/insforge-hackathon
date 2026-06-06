"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import * as THREE from "three";
import type { Tour, Room, Placement } from "@/lib/tour-types";
import { FURNITURE_CATALOG, type FurnitureItem } from "@/lib/furniture-catalog";

const PanoramaViewer = dynamic(
  () => import("@/components/panorama-viewer").then((m) => m.PanoramaViewer),
  { ssr: false }
);

let nextLocalId = 1;

export default function StagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<FurnitureItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/tours/${id}`)
      .then((r) => r.json())
      .then((data: Tour) => {
        setTour(data);
        if (data.rooms?.length) {
          const firstRoom = data.rooms[0];
          setCurrentRoomId(firstRoom.id);
          setPlacements(firstRoom.placements ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function switchRoom(roomId: string) {
    const room = tour?.rooms?.find((r: Room) => r.id === roomId);
    if (!room) return;
    setCurrentRoomId(roomId);
    setPlacements(room.placements ?? []);
    setSelectedId(null);
    setPendingItem(null);
  }

  function handleFloorClick(point: THREE.Vector3) {
    if (!pendingItem || !currentRoomId) return;
    const newPlacement: Placement = {
      id: `local-${nextLocalId++}`,
      room_id: currentRoomId,
      model_id: pendingItem.id,
      position_x: point.x,
      position_y: -1.7 + pendingItem.size[1] / 2,
      position_z: point.z,
      rotation_y: 0,
    };
    setPlacements((prev) => [...prev, newPlacement]);
    setSelectedId(newPlacement.id);
    setPendingItem(null);
  }

  function deleteSelected() {
    setPlacements((prev) => prev.filter((p) => p.id !== selectedId));
    setSelectedId(null);
  }

  function rotateSelected() {
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, rotation_y: p.rotation_y + Math.PI / 4 } : p
      )
    );
  }

  async function save() {
    if (!currentRoomId) return;
    setSaving(true);
    await fetch(`/api/tours/${id}/placements`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: currentRoomId, placements }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Sync saved placements back into tour rooms for switching
    setTour((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rooms: prev.rooms?.map((r: Room) =>
          r.id === currentRoomId ? { ...r, placements } : r
        ),
      };
    });
  }

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!tour || !tour.rooms?.length) {
    return (
      <div className="h-screen bg-black flex items-center justify-center text-white/60">
        Tour not found
      </div>
    );
  }

  const currentRoom = tour.rooms.find((r: Room) => r.id === currentRoomId) ?? tour.rooms[0];
  const selected = placements.find((p) => p.id === selectedId);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative flex">
      {/* Furniture catalog sidebar */}
      <aside className="w-64 shrink-0 h-full bg-[#0a0a0a] border-r border-white/10 flex flex-col z-20 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="font-semibold text-sm text-white">Furniture</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {pendingItem ? `Placing: ${pendingItem.label} — click floor` : "Click an item to place it"}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
          {FURNITURE_CATALOG.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(null);
                setPendingItem(pendingItem?.id === item.id ? null : item);
              }}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 border text-center transition-colors ${
                pendingItem?.id === item.id
                  ? "border-blue-500 bg-blue-500/10 text-blue-300"
                  : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <span className="text-2xl leading-none">{item.emoji}</span>
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Selected item controls */}
        {selected && (
          <div className="border-t border-white/10 p-3 flex flex-col gap-2">
            <p className="text-xs text-white/50">Selected item</p>
            <div className="flex gap-2">
              <button
                onClick={rotateSelected}
                className="flex-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-1.5 transition-colors"
              >
                ↻ Rotate
              </button>
              <button
                onClick={deleteSelected}
                className="flex-1 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg py-1.5 transition-colors"
              >
                🗑 Delete
              </button>
            </div>
          </div>
        )}

        {/* Save + View */}
        <div className="border-t border-white/10 p-3 flex flex-col gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-white text-black font-semibold text-sm rounded-xl py-2 disabled:opacity-50 transition-opacity active:scale-95"
          >
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save Changes"}
          </button>
          <button
            onClick={() => router.push(`/tour/${id}`)}
            className="w-full text-white/50 hover:text-white text-xs transition-colors"
          >
            ← Back to tour
          </button>
        </div>
      </aside>

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        <PanoramaViewer
          rooms={tour.rooms}
          currentRoomId={currentRoom.id}
          onRoomChange={switchRoom}
          stagingMode
          pendingModelItem={pendingItem}
          placements={placements}
          selectedPlacementId={selectedId}
          onPlacementSelect={setSelectedId}
          onFloorClick={handleFloorClick}
        />

        {/* Room switcher */}
        {tour.rooms.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center">
            {tour.rooms.map((room: Room) => (
              <button
                key={room.id}
                onClick={() => switchRoom(room.id)}
                className={`text-xs px-3 py-1.5 rounded-full border backdrop-blur transition-colors ${
                  room.id === currentRoom.id
                    ? "bg-white text-black border-white"
                    : "bg-black/50 text-white/60 border-white/20 hover:text-white"
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}

        {/* Placement hint overlay */}
        {pendingItem && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 backdrop-blur bg-blue-500/20 border border-blue-500/40 rounded-full px-4 py-2 text-sm text-blue-200 pointer-events-none">
            Click anywhere on the floor to place {pendingItem.label}
          </div>
        )}
      </div>
    </div>
  );
}
