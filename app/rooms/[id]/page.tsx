"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  insforge,
  type Room,
  type RoomPhoto,
  type RoomLayout,
} from "@/lib/insforge";
import { useAuth } from "@/lib/auth-context";
import { downloadRoomHtml } from "@/lib/exportHtml";

const GalleryRoom = dynamic(() => import("@/components/GalleryRoom"), {
  ssr: false,
});

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [photos, setPhotos] = useState<RoomPhoto[]>([]);
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [fetching, setFetching] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [reconstructing, setReconstructing] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [mode, setMode] = useState<"reconstruction" | "gallery">("reconstruction");
  const [exporting, setExporting] = useState(false);
  const autoTried = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  const urls = photos.map((p) => p.url);

  const runReconstruct = useCallback(
    async (roomId: string, photoUrls: string[], roomName: string) => {
      if (photoUrls.length === 0) return;
      setReconstructing(true);
      setRecError(null);
      try {
        const res = await fetch("/api/reconstruct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoUrls, roomName }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Reconstruction failed");
        const newLayout = json.layout as RoomLayout;

        // Save via the user's RLS-scoped client (ownership enforced by RLS).
        await insforge.database
          .from("rooms")
          .update({ layout: newLayout, layout_status: "ready" })
          .eq("id", roomId);

        setLayout(newLayout);
        setMode("reconstruction");
      } catch (err) {
        setRecError(err instanceof Error ? err.message : "Reconstruction failed");
        await insforge.database
          .from("rooms")
          .update({ layout_status: "error" })
          .eq("id", roomId);
      } finally {
        setReconstructing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!user) return;
    (async () => {
      setFetching(true);
      const { data: roomData, error } = await insforge.database
        .from("rooms")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !roomData) {
        setNotFound(true);
        setFetching(false);
        return;
      }
      const r = roomData as Room;
      setRoom(r);
      setLayout(r.layout ?? null);

      const { data: photoData } = await insforge.database
        .from("room_photos")
        .select("*")
        .eq("room_id", id)
        .order("sort_order", { ascending: true });
      const ps = (photoData as RoomPhoto[]) ?? [];
      setPhotos(ps);
      setFetching(false);

      // Auto-reconstruct the first time a room is opened.
      if (
        !autoTried.current &&
        r.layout_status !== "ready" &&
        ps.length > 0
      ) {
        autoTried.current = true;
        runReconstruct(r.id, ps.map((p) => p.url), r.name);
      }
    })();
  }, [user, id, runReconstruct]);

  if (loading || (fetching && !notFound)) {
    return (
      <div className="flex flex-1 items-center justify-center text-white/40">
        Loading room…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-white/60">Room not found.</p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm hover:bg-indigo-400"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const activeLayout = mode === "reconstruction" ? layout : null;

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-5 py-4">
        <Link
          href="/dashboard"
          className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white/80 backdrop-blur hover:bg-black/60"
        >
          ← Rooms
        </Link>

        <div className="flex items-center gap-2">
          {layout && (
            <div className="flex overflow-hidden rounded-lg border border-white/10 bg-black/40 text-xs backdrop-blur">
              <button
                onClick={() => setMode("reconstruction")}
                className={`px-3 py-1.5 ${
                  mode === "reconstruction"
                    ? "bg-indigo-500 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                AI room
              </button>
              <button
                onClick={() => setMode("gallery")}
                className={`px-3 py-1.5 ${
                  mode === "gallery"
                    ? "bg-indigo-500 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Gallery
              </button>
            </div>
          )}

          <button
            onClick={() =>
              room && runReconstruct(room.id, urls, room.name)
            }
            disabled={reconstructing || urls.length === 0}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white/80 backdrop-blur hover:bg-black/60 disabled:opacity-50"
          >
            {reconstructing
              ? "Reconstructing…"
              : layout
                ? "Re-run AI"
                : "Reconstruct in 3D"}
          </button>

          <button
            onClick={async () => {
              if (!room || urls.length === 0) return;
              setExporting(true);
              try {
                await downloadRoomHtml({
                  filename: "makerspace_3d_model.html",
                  title: layout?.title || room.name,
                  layout,
                  photoUrls: urls,
                });
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting || urls.length === 0}
            className="rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-3 py-1.5 text-sm text-indigo-100 backdrop-blur hover:bg-indigo-500/30 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "⬇ Download .html"}
          </button>

          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm backdrop-blur">
            {layout?.title || room?.name}{" "}
            <span className="text-white/40">· {photos.length} photos</span>
          </div>
        </div>
      </header>

      <div className="flex-1">
        {urls.length === 0 ? (
          <div className="flex h-full items-center justify-center text-white/40">
            This room has no photos.
          </div>
        ) : (
          <GalleryRoom photoUrls={urls} layout={activeLayout} />
        )}
      </div>

      {/* Reconstruction overlay */}
      {reconstructing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-10 py-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
            <div>
              <p className="font-medium">Reconstructing your room with AI…</p>
              <p className="mt-1 text-sm text-white/50">
                The vision model is inferring the layout from your photos.
              </p>
            </div>
          </div>
        </div>
      )}

      {recError && !reconstructing && (
        <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-300">
          {recError}
        </div>
      )}
    </div>
  );
}
