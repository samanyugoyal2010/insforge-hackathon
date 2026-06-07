"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { insforge, type Room } from "@/lib/insforge";
import { useAuth } from "@/lib/auth-context";
import CreateRoomModal from "@/components/CreateRoomModal";

type RoomWithCount = Room & { room_photos: { id: string }[] };

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomWithCount[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  const loadRooms = useCallback(async () => {
    setFetching(true);
    const { data, error } = await insforge.database
      .from("rooms")
      .select("*, room_photos(id)")
      .order("created_at", { ascending: false });
    if (!error && data) setRooms(data as RoomWithCount[]);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (user) loadRooms();
  }, [user, loadRooms]);

  async function deleteRoom(id: string) {
    if (!confirm("Delete this room and its photos?")) return;
    setRooms((prev) => prev.filter((r) => r.id !== id));
    await insforge.database.from("rooms").delete().eq("id", id);
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-white/40">
        Loading…
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your rooms</h1>
          <p className="text-sm text-white/50">
            Signed in as {user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            + New room
          </button>
          <button
            onClick={() => signOut().then(() => router.replace("/"))}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      </header>

      {fetching ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-16 text-center">
          <p className="text-lg text-white/70">No rooms yet</p>
          <p className="mt-1 text-sm text-white/40">
            Create your first 3D gallery from a set of HEIC photos.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            + New room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-indigo-400/40"
            >
              <Link href={`/rooms/${room.id}`} className="block p-5">
                <div className="mb-8 flex h-20 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10 text-3xl">
                  🏛️
                </div>
                <h3 className="font-medium">{room.name}</h3>
                <p className="mt-1 text-xs text-white/40">
                  {room.room_photos?.length ?? 0} photo
                  {(room.room_photos?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                  {new Date(room.created_at).toLocaleDateString()}
                </p>
              </Link>
              <button
                onClick={() => deleteRoom(room.id)}
                className="absolute right-3 top-3 rounded-md bg-black/40 px-2 py-1 text-xs text-white/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRoomModal
          userId={user.id}
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => {
            setShowCreate(false);
            router.push(`/rooms/${roomId}`);
          }}
        />
      )}
    </main>
  );
}
