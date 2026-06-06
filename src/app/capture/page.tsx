"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { extractFrames, type ExtractedFrame } from "@/lib/extract-frames";

const ROOM_PRESETS = [
  "Living Room", "Kitchen", "Master Bedroom", "Bedroom",
  "Bathroom", "Dining Room", "Office", "Garage", "Backyard", "Other",
];

const DEV_TOURS = [
  {
    label: "Developer 1", address: "Developer 1",
    rooms: [
      { name: "Living Room",    photo_url: "https://picsum.photos/id/1040/2000/1000" },
      { name: "Kitchen",        photo_url: "https://picsum.photos/id/431/2000/1000"  },
      { name: "Master Bedroom", photo_url: "https://picsum.photos/id/164/2000/1000"  },
    ],
  },
  {
    label: "Developer 2", address: "Developer 2",
    rooms: [
      { name: "Living Room", photo_url: "https://picsum.photos/id/238/2000/1000" },
      { name: "Bathroom",    photo_url: "https://picsum.photos/id/169/2000/1000" },
      { name: "Office",      photo_url: "https://picsum.photos/id/201/2000/1000" },
    ],
  },
  {
    label: "Developer 3", address: "Developer 3",
    rooms: [
      { name: "Living Room",    photo_url: "https://picsum.photos/id/1076/2000/1000" },
      { name: "Dining Room",    photo_url: "https://picsum.photos/id/149/2000/1000"  },
      { name: "Master Bedroom", photo_url: "https://picsum.photos/id/206/2000/1000"  },
      { name: "Backyard",       photo_url: "https://picsum.photos/id/1036/2000/1000" },
    ],
  },
] as const;

// ─── Shared API helper ────────────────────────────────────────────────────────

async function buildTour(address: string, rooms: { name: string; photo_url: string }[]): Promise<string> {
  const r = await fetch("/api/tours", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: address, address }),
  });
  if (!r.ok) throw new Error(`Could not create tour (${r.status})`);
  const { id: tourId } = await r.json();

  const roomIds: string[] = [];
  for (let i = 0; i < rooms.length; i++) {
    const res = await fetch(`/api/tours/${tourId}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rooms[i], display_order: i }),
    });
    if (!res.ok) throw new Error(`Could not save room "${rooms[i].name}"`);
    roomIds.push((await res.json()).id);
  }

  for (let i = 0; i < roomIds.length - 1; i++) {
    await fetch(`/api/tours/${tourId}/hotspots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_room_id: roomIds[i], to_room_id: roomIds[i + 1], theta: 0, phi: 0 }),
    });
  }
  return tourId;
}

// ─── Photo room card ──────────────────────────────────────────────────────────

interface RoomEntry { name: string; file: File | null; preview: string | null; uploading: boolean; uploaded_url: string | null; }

function RoomCard({ room, index, onChange, onRemove }: {
  room: RoomEntry; index: number;
  onChange: (i: number, u: Partial<RoomEntry>) => void;
  onRemove: (i: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <select value={room.name} onChange={(e) => onChange(index, { name: e.target.value })}
          className="bg-transparent text-white font-medium text-sm outline-none cursor-pointer">
          {ROOM_PRESETS.map((p) => <option key={p} value={p} className="bg-black">{p}</option>)}
        </select>
        <button onClick={() => onRemove(index)} className="text-white/40 hover:text-red-400 text-lg leading-none">×</button>
      </div>

      {room.preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={room.preview} alt={room.name} className="w-full h-40 object-cover rounded-xl" />
          {room.uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          {room.uploaded_url && <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">✓</div>}
          <button onClick={() => inputRef.current?.click()} className="mt-2 w-full text-xs text-white/50 hover:text-white/80 transition-colors">Replace</button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()}
          className="h-40 rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:border-white/40 transition-colors">
          <span className="text-3xl">📸</span>
          <span className="text-sm text-white/60">Tap to take photo</span>
          <span className="text-xs text-white/30">iPhone Panorama works best</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(index, { file: f, preview: URL.createObjectURL(f), uploaded_url: null }); }} />
    </div>
  );
}

// ─── Video frame card ─────────────────────────────────────────────────────────

function FrameCard({ frame, index, onRename, onRemove }: {
  frame: ExtractedFrame; index: number;
  onRename: (i: number, name: string) => void;
  onRemove: (i: number) => void;
}) {
  const mins = Math.floor(frame.timestamp / 60);
  const secs = Math.floor(frame.timestamp % 60).toString().padStart(2, "0");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.preview} alt={`Frame ${index + 1}`} className="w-full h-36 object-cover" />
      <div className="p-2.5 flex items-center gap-2">
        <input value={frame.roomName} onChange={(e) => onRename(index, e.target.value)}
          className="flex-1 bg-transparent text-white text-sm outline-none min-w-0" placeholder="Room name" />
        <span className="text-white/25 text-xs shrink-0">{mins}:{secs}</span>
        <button onClick={() => onRemove(index)} className="text-white/30 hover:text-red-400 text-base leading-none shrink-0">×</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = "photo" | "video";
type Step = "address" | "rooms" | "creating";

export default function CapturePage() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [mode, setMode] = useState<Mode>("photo");
  const [step, setStep] = useState<Step>("address");
  const [creatingLabel, setCreatingLabel] = useState("Creating your tour…");
  const [error, setError] = useState<string | null>(null);

  // Photo mode
  const [rooms, setRooms] = useState<RoomEntry[]>([
    { name: "Living Room", file: null, preview: null, uploading: false, uploaded_url: null },
  ]);

  // Video mode
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [intervalSecs, setIntervalSecs] = useState(5);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function handleVideoFile(file: File) {
    setVideoFile(file);
    setFrames([]);
    setExtracting(true);
    setExtractProgress(0);
    try {
      const extracted = await extractFrames(file, intervalSecs, (p) => setExtractProgress(p));
      setFrames(extracted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract frames");
    } finally {
      setExtracting(false);
    }
  }

  function renameFrame(i: number, name: string) {
    setFrames((f) => f.map((fr, idx) => idx === i ? { ...fr, roomName: name } : fr));
  }
  function updateRoom(i: number, u: Partial<RoomEntry>) {
    setRooms((r) => r.map((room, idx) => idx === i ? { ...room, ...u } : room));
  }

  async function launchDevTour(preset: typeof DEV_TOURS[number]) {
    setCreatingLabel(`Spinning up ${preset.label}…`);
    setStep("creating");
    try {
      const tourId = await buildTour(preset.address, [...preset.rooms]);
      router.push(`/tour/${tourId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStep("address");
    }
  }

  async function createVideoTour() {
    if (!frames.length) { setError("No frames extracted."); return; }
    setCreatingLabel("Uploading frames…");
    setStep("creating");
    try {
      const uploaded: { name: string; photo_url: string }[] = [];
      for (const frame of frames) {
        const fd = new FormData();
        fd.append("file", frame.blob, `frame-${Date.now()}.jpg`);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { url } = await res.json();
        uploaded.push({ name: frame.roomName, photo_url: url });
      }
      const tourId = await buildTour(address || "My Property", uploaded);
      router.push(`/tour/${tourId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStep("rooms");
    }
  }

  async function createPhotoTour() {
    const hasPhotos = rooms.some((r) => r.file);
    if (!hasPhotos) { setError("Add at least one photo."); return; }
    setCreatingLabel("Uploading photos…");
    setStep("creating");
    try {
      const uploaded: { name: string; photo_url: string }[] = [];
      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        if (!room.file) continue;
        updateRoom(i, { uploading: true });
        const fd = new FormData();
        fd.append("file", room.file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Upload failed for ${room.name}`);
        const { url } = await res.json();
        updateRoom(i, { uploading: false, uploaded_url: url });
        uploaded.push({ name: room.name, photo_url: url });
      }
      const tourId = await buildTour(address || "My Property", uploaded);
      router.push(`/tour/${tourId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStep("rooms");
    }
  }

  if (step === "creating") {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <p className="text-white/60 text-sm">{creatingLabel}</p>
      </main>
    );
  }

  if (step === "address") {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-16 overflow-y-auto">
        <div className="w-full max-w-sm flex flex-col gap-5 my-auto">
          <div className="text-center">
            <div className="text-5xl mb-3">🏠</div>
            <h1 className="text-2xl font-bold">New Virtual Tour</h1>
            <p className="text-white/50 text-sm mt-1">Enter a property address to get started</p>
          </div>
          <input type="text" placeholder="123 Main St, San Francisco, CA" value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/40"
            autoFocus />
          <button onClick={() => { if (!address.trim()) setAddress("My Property"); setStep("rooms"); }}
            className="w-full rounded-xl bg-white text-black font-semibold py-3 active:scale-95 transition-transform">
            Continue →
          </button>
          <div className="relative flex items-center gap-3 pt-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-mono text-white/30 tracking-widest">DEV</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="flex flex-col gap-2">
            {DEV_TOURS.map((preset) => (
              <button key={preset.label} onClick={() => launchDevTour(preset)}
                className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-4 py-2.5 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-amber-400 text-xs font-mono">⚡</span>
                  <span className="text-sm text-white/70">{preset.label}</span>
                  <span className="text-[10px] text-white/25">{preset.rooms.length} rooms</span>
                </div>
                <span className="text-xs text-white/30">→</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white pb-32">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-sm">{address}</h1>
            <p className="text-white/40 text-xs">
              {mode === "video"
                ? frames.length ? `${frames.length} frames extracted` : "No video selected"
                : `${rooms.filter(r => r.file).length} of ${rooms.length} rooms photographed`}
            </p>
          </div>
          {mode === "photo" && (
            <button onClick={() => setRooms((r) => [...r, { name: "Bedroom", file: null, preview: null, uploading: false, uploaded_url: null }])}
              className="text-sm text-white/60 hover:text-white border border-white/20 rounded-lg px-3 py-1.5">
              + Room
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-4">
          {(["photo", "video"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors capitalize ${mode === m ? "bg-white text-black" : "text-white/50 hover:text-white"}`}>
              {m === "photo" ? "📸 Photos" : "🎥 Video"}
            </button>
          ))}
        </div>
      </div>

      {mode === "photo" && (
        <div className="max-w-lg mx-auto px-4 flex flex-col gap-3">
          {rooms.map((room, i) => (
            <RoomCard key={i} room={room} index={i} onChange={updateRoom}
              onRemove={(i) => setRooms((r) => r.filter((_, idx) => idx !== i))} />
          ))}
        </div>
      )}

      {mode === "video" && (
        <div className="max-w-lg mx-auto px-4 flex flex-col gap-4">
          <button onClick={() => videoInputRef.current?.click()}
            className="rounded-2xl border-2 border-dashed border-white/20 hover:border-white/40 p-8 flex flex-col items-center gap-3 transition-colors">
            <span className="text-4xl">🎥</span>
            <div className="text-center">
              <p className="text-white/80 font-medium text-sm">{videoFile ? videoFile.name : "Tap to select your walkthrough video"}</p>
              <p className="text-white/40 text-xs mt-1">Record yourself walking through each room</p>
            </div>
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }} />

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm text-white/80 font-medium">Frame interval</p>
              <p className="text-xs text-white/40">One photo every N seconds</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIntervalSecs((s) => Math.max(2, s - 1))}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center">−</button>
              <span className="text-white font-mono text-sm w-6 text-center">{intervalSecs}s</span>
              <button onClick={() => setIntervalSecs((s) => Math.min(30, s + 1))}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center">+</button>
            </div>
          </div>

          {extracting && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>Extracting frames…</span>
                <span>{Math.round(extractProgress * 100)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/70 rounded-full transition-all" style={{ width: `${extractProgress * 100}%` }} />
              </div>
            </div>
          )}

          {frames.length > 0 && (
            <>
              <p className="text-xs text-white/40">{frames.length} frames — tap a name to edit, × to remove</p>
              <div className="grid grid-cols-2 gap-3">
                {frames.map((frame, i) => (
                  <FrameCard key={i} frame={frame} index={i} onRename={renameFrame}
                    onRemove={(i) => setFrames((f) => f.filter((_, idx) => idx !== i))} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 backdrop-blur border-t border-white/10">
        <div className="max-w-lg mx-auto">
          <button
            onClick={mode === "video" ? createVideoTour : createPhotoTour}
            disabled={mode === "video" && (extracting || frames.length === 0)}
            className="w-full rounded-xl bg-white text-black font-semibold py-3 disabled:opacity-30 active:scale-95 transition-transform">
            {mode === "video"
              ? frames.length ? `Create Tour from ${frames.length} frames ✨` : "Select a video first"
              : "Create Tour ✨"}
          </button>
        </div>
      </div>
    </main>
  );
}
