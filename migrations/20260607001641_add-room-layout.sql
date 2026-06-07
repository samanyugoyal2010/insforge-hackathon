-- AI-inferred 3D layout spec for a room (dimensions, colors, furniture boxes).
-- Null until a reconstruction has been run.
ALTER TABLE rooms ADD COLUMN layout jsonb;

-- 'none' | 'pending' | 'ready' | 'error'
ALTER TABLE rooms ADD COLUMN layout_status text NOT NULL DEFAULT 'none';
