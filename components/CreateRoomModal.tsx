"use client";

import { useState, useRef } from "react";
import { insforge, PHOTO_BUCKET, type RoomLayout } from "@/lib/insforge";
import { toWebImage } from "@/lib/heic";
import { downloadRoomHtml } from "@/lib/exportHtml";

type Props = {
  userId: string;
  onClose: () => void;
  onCreated: (roomId: string) => void;
};

export default function CreateRoomModal({ userId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter(
      (f) => f.type.startsWith("image/") || /\.hei[cf]$/i.test(f.name)
    );
    setFiles((prev) => [...prev, ...incoming]);
  }

  async function handleCreate() {
    setError(null);
    if (files.length === 0) {
      setError("Add at least one photo.");
      return;
    }
    setBusy(true);
    try {
      // 1. Create the room row
      const { data: roomRows, error: roomErr } = await insforge.database
        .from("rooms")
        .insert([{ user_id: userId, name: name.trim() || "Untitled Room" }])
        .select();
      if (roomErr) throw new Error(roomErr.message);
      const room = roomRows?.[0];
      if (!room) throw new Error("Failed to create room.");

      // 2. Convert + upload each photo, collecting rows
      const photoRows: {
        room_id: string;
        url: string;
        object_key: string;
        sort_order: number;
      }[] = [];

      for (let i = 0; i < files.length; i++) {
        setProgress(`Processing photo ${i + 1} of ${files.length}…`);
        const blob = await toWebImage(files[i]);
        const ext = blob.type === "image/png" ? "png" : "jpg";
        const key = `${room.id}/${i}-${Date.now()}.${ext}`;
        const fileToUpload = new File([blob], key.split("/").pop()!, {
          type: blob.type,
        });

        const { data: up, error: upErr } = await insforge.storage
          .from(PHOTO_BUCKET)
          .upload(key, fileToUpload);
        if (upErr) throw new Error(upErr.message);

        photoRows.push({
          room_id: room.id,
          url: up!.url,
          object_key: up!.key,
          sort_order: i,
        });
      }

      // 3. Persist photo rows
      setProgress("Saving room…");
      const { error: photoErr } = await insforge.database
        .from("room_photos")
        .insert(photoRows);
      if (photoErr) throw new Error(photoErr.message);

      const photoUrls = photoRows.map((p) => p.url);

      // 4. Reconstruct the 3D model from the photos (~30s)
      let layout: RoomLayout | null = null;
      setProgress("Reconstructing 3D model from your photos… (~30s)");
      try {
        const res = await fetch("/api/reconstruct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoUrls,
            roomName: name.trim() || "Untitled Room",
          }),
        });
        const json = await res.json();
        if (res.ok && json.layout) {
          layout = json.layout as RoomLayout;
          await insforge.database
            .from("rooms")
            .update({ layout, layout_status: "ready" })
            .eq("id", room.id);
        } else {
          await insforge.database
            .from("rooms")
            .update({ layout_status: "error" })
            .eq("id", room.id);
        }
      } catch {
        // fall through — we still export a gallery-only model
        await insforge.database
          .from("rooms")
          .update({ layout_status: "error" })
          .eq("id", room.id);
      }

      // 5. Generate + download the standalone 3D model file
      setProgress("Preparing makerspace_3d_model.html…");
      await downloadRoomHtml({
        filename: "makerspace_3d_model.html",
        title: layout?.title || name.trim() || "3D Room",
        layout,
        photoUrls,
      });

      onCreated(room.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11111a] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New room</h2>
          {!busy && (
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/80"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        <label className="mb-1 block text-xs text-white/50">Room name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Living Room"
          disabled={busy}
          className="mb-4 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-indigo-400/60"
        />

        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) addFiles(e.dataTransfer.files);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-black/20 px-4 py-8 text-center transition-colors hover:border-indigo-400/50"
        >
          <span className="text-sm text-white/70">
            Drop HEIC photos here or click to browse
          </span>
          <span className="text-xs text-white/40">
            Each photo becomes a panel on the gallery walls
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".heic,.heif,image/heic,image/heif,image/*"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2 text-sm">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-2 py-1 text-white/60"
              >
                <span className="truncate">{f.name}</span>
                {!busy && (
                  <button
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="ml-2 text-white/30 hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-white/40">{progress}</span>
          <div className="flex gap-2">
            {!busy && (
              <button
                onClick={onClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreate}
              disabled={busy}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? "Building…" : `Create room (${files.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
