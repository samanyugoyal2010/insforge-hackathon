"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Tour, Room } from "@/lib/tour-types";

const PanoramaViewer = dynamic(
  () => import("@/components/panorama-viewer").then((m) => m.PanoramaViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-[#111]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function TourPage() {
  const { id } = useParams<{ id: string }>();
  const [tour, setTour] = useState<Tour | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/tours/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data: Tour) => {
        setTour(data);
        if (data.rooms?.length) setCurrentRoomId(data.rooms[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="h-screen bg-[#111] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !tour || !tour.rooms?.length) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center gap-4 text-white px-6 text-center">
        <p className="text-4xl">⚠️</p>
        <p className="text-white/80">{error ?? "No rooms found for this tour."}</p>
        <Link href="/capture" className="mt-2 rounded-full bg-white text-black text-sm font-medium px-5 py-2">
          ← Back to capture
        </Link>
      </div>
    );
  }

  const currentRoom = tour.rooms.find((r: Room) => r.id === currentRoomId) ?? tour.rooms[0];

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111] relative">
      {/* Full-screen viewer */}
      <div className="absolute inset-0">
        <PanoramaViewer
          rooms={tour.rooms}
          currentRoomId={currentRoom.id}
          onRoomChange={setCurrentRoomId}
        />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-none z-10">
        <Link
          href="/capture"
          className="pointer-events-auto text-white/70 hover:text-white text-sm backdrop-blur bg-black/50 rounded-full px-3 py-1.5 border border-white/10 transition-colors"
        >
          ← Home
        </Link>
        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={copyLink}
            className="text-sm backdrop-blur bg-black/50 text-white/80 hover:text-white border border-white/10 rounded-full px-3 py-1.5 transition-colors"
          >
            {copied ? "✓ Copied!" : "Share"}
          </button>
          <Link
            href={`/tour/${id}/stage`}
            className="text-sm backdrop-blur bg-white text-black font-semibold rounded-full px-4 py-1.5 hover:bg-white/90 transition-opacity"
          >
            Stage Room ✨
          </Link>
        </div>
      </div>

      {/* Bottom: room name + room picker pills */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center gap-3 pointer-events-none z-10">
        <div className="backdrop-blur bg-black/60 border border-white/10 rounded-2xl px-5 py-2 text-center">
          <p className="text-white font-semibold text-sm">{currentRoom.name}</p>
          <p className="text-white/40 text-xs">{tour.address}</p>
        </div>

        {tour.rooms.length > 1 && (
          <div className="pointer-events-auto flex gap-2 flex-wrap justify-center pb-2">
            {tour.rooms.map((room: Room) => (
              <button
                key={room.id}
                onClick={() => setCurrentRoomId(room.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  room.id === currentRoom.id
                    ? "bg-white text-black border-white font-medium"
                    : "bg-black/50 text-white/60 border-white/20 hover:text-white backdrop-blur"
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
