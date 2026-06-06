CREATE TABLE IF NOT EXISTS tours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  address     TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id       UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  photo_url     TEXT NOT NULL,
  display_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hotspots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  to_room_id   UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  theta        FLOAT NOT NULL DEFAULT 0,
  phi          FLOAT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS placements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  model_id   TEXT  NOT NULL,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  position_z FLOAT NOT NULL DEFAULT 0,
  rotation_y FLOAT NOT NULL DEFAULT 0
);
