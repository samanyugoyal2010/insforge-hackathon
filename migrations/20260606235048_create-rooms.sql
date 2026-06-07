-- Rooms: each user owns many rooms
CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Room',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Photos: each room has many wall photos (already converted to web image URLs)
CREATE TABLE room_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  url text NOT NULL,
  object_key text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_user_id ON rooms(user_id);
CREATE INDEX idx_room_photos_room_id ON room_photos(room_id);

-- RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_photos ENABLE ROW LEVEL SECURITY;

-- rooms: owner-only access
CREATE POLICY "rooms_select_own" ON rooms
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rooms_insert_own" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rooms_update_own" ON rooms
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rooms_delete_own" ON rooms
  FOR DELETE USING (auth.uid() = user_id);

-- room_photos: access governed by ownership of the parent room
CREATE POLICY "room_photos_select_own" ON room_photos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_photos.room_id AND r.user_id = auth.uid())
  );
CREATE POLICY "room_photos_insert_own" ON room_photos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_photos.room_id AND r.user_id = auth.uid())
  );
CREATE POLICY "room_photos_delete_own" ON room_photos
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_photos.room_id AND r.user_id = auth.uid())
  );
