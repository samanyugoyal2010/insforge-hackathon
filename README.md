# Roomscape — HEIC → walkable 3D gallery

Upload HEIC photos of a room and walk through a 3D gallery built from them.
Each photo becomes a framed panel on the walls of a virtual room. Sign in,
create as many rooms as you like — they're saved to your account.

## Stack

- **Next.js 16** (App Router, client-rendered) + **React 19** + **Tailwind v4**
- **Three.js** — the 3D gallery, first-person `PointerLockControls` + WASD
- **heic2any** — converts HEIC/HEIF → JPEG in the browser (no server GPU)
- **InsForge** — auth (accounts), Postgres (rooms + photos), storage (images)

## How it works

1. Sign up / sign in (InsForge auth — email verification is disabled for instant access).
2. **New room** → name it, drop multiple HEIC files.
3. Each file is converted client-side, uploaded to the `room-photos` bucket, and
   recorded in `room_photos`.
4. Open a room → Three.js builds a box room, distributes the photos around the
   four walls, and lets you walk through it (click to enter, WASD + mouse, Esc to release).

## Data model (InsForge project `test`)

- `rooms` — `id, user_id → auth.users, name, created_at` (RLS: owner-only)
- `room_photos` — `id, room_id → rooms, url, object_key, sort_order` (RLS via parent room)
- Storage bucket `room-photos` (public — so Three.js can load textures by URL)

Schema lives in `migrations/`. Backend config (e.g. email verification off) in `insforge.toml`.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

Env is in `.env.local` (`NEXT_PUBLIC_INSFORGE_URL`, `NEXT_PUBLIC_INSFORGE_ANON_KEY`).

## Notes

- `standalone-prototype/index.html` is the original single-file HEIC→3D-cube prototype.
- The anon key is safe to expose; the admin key in `.insforge/project.json` is **not**
  and is gitignored.
