import { createClient } from "@insforge/sdk";

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

if (!baseUrl || !anonKey) {
  // Surfaced during dev if env wiring is wrong.
  console.warn(
    "[insforge] Missing NEXT_PUBLIC_INSFORGE_URL or NEXT_PUBLIC_INSFORGE_ANON_KEY"
  );
}

export const insforge = createClient({
  baseUrl: baseUrl as string,
  anonKey: anonKey as string,
});

export const PHOTO_BUCKET = "room-photos";

export type RoomObject = {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  color: string;
};

export type RoomLayout = {
  title?: string;
  roomType?: string;
  dimensions: { width: number; depth: number; height: number };
  wallColor?: string;
  floorColor?: string;
  ceilingColor?: string;
  objects: RoomObject[];
};

export type LayoutStatus = "none" | "pending" | "ready" | "error";

export type Room = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  layout: RoomLayout | null;
  layout_status: LayoutStatus;
};

export type RoomPhoto = {
  id: string;
  room_id: string;
  url: string;
  object_key: string | null;
  sort_order: number;
  created_at: string;
};
