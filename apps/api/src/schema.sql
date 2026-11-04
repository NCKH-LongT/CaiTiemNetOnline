CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  nickname text NOT NULL,
  fullname text NOT NULL,
  password_hash text NOT NULL,
  avatar_url text,
  x real NOT NULL DEFAULT 0,
  z real NOT NULL DEFAULT 23,
  balance_seconds integer NOT NULL DEFAULT 3600 CHECK (balance_seconds >= 0),
  donated_seconds integer NOT NULL DEFAULT 0,
  online_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_seconds integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS players_username_unique ON players (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS players_nickname_unique ON players (lower(nickname));
CREATE TABLE IF NOT EXISTS player_sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS pc_states (
  station_id integer PRIMARY KEY CHECK (station_id BETWEEN 1 AND 200),
  wallpaper_url text,
  browser_url text,
  updated_by uuid REFERENCES players(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pc_visitors (
  station_id integer NOT NULL CHECK (station_id BETWEEN 1 AND 200),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, player_id)
);
ALTER TABLE pc_visitors ADD COLUMN IF NOT EXISTS visited_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS art_images (
  id uuid PRIMARY KEY,
  station_id integer NOT NULL CHECK (station_id BETWEEN 1 AND 200),
  player_id uuid NOT NULL REFERENCES players(id),
  image_url text NOT NULL,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS art_votes (
  image_id uuid NOT NULL REFERENCES art_images(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  PRIMARY KEY (image_id, player_id)
);
CREATE INDEX IF NOT EXISTS art_images_station_date ON art_images (station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS art_votes_image_vote ON art_votes (image_id, vote);
CREATE TABLE IF NOT EXISTS gift_log (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES players(id),
  recipient_id uuid NOT NULL REFERENCES players(id),
  seconds integer NOT NULL CHECK (seconds > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS world_objects (
  id uuid PRIMARY KEY,
  asset_url text NOT NULL,
  license text NOT NULL,
  x real NOT NULL,
  y real NOT NULL,
  z real NOT NULL,
  rotation real NOT NULL DEFAULT 0,
  scale real NOT NULL DEFAULT 1,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS asset_catalog (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  asset_url text NOT NULL,
  license text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('glb','gltf')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS artist_levels (
  level integer PRIMARY KEY,
  name text NOT NULL,
  min_uploads integer NOT NULL,
  min_likes integer NOT NULL
);
CREATE TABLE IF NOT EXISTS board_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  background_url text,
  background_color text NOT NULL DEFAULT '#231c3c'
);
INSERT INTO board_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO artist_levels (level, name, min_uploads, min_likes) VALUES
  (1, 'Tân binh', 0, 0),
  (2, 'Họa sĩ tập sự', 3, 10),
  (3, 'Nghệ sĩ', 10, 50),
  (4, 'Danh họa', 25, 200),
  (5, 'Huyền thoại', 50, 500)
ON CONFLICT (level) DO NOTHING;
