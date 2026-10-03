-- Flashmind schema — matches src/lib/types.ts. Existing integer IDs are preserved on migration.

DROP TABLE IF EXISTS practice_sessions CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS sets CASCADE;
DROP TABLE IF EXISTS folders CASCADE;

CREATE TABLE folders (
  id serial PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sets (
  id serial PRIMARY KEY,
  folder_id int REFERENCES folders(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cards (
  id serial PRIMARY KEY,
  set_id int NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  term text NOT NULL,
  definition text NOT NULL DEFAULT '',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attachments (
  id serial PRIMARY KEY,
  card_id int NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image', 'audio')),
  name text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT '',
  ordinal int NOT NULL DEFAULT 0,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE practice_sessions (
  set_id int PRIMARY KEY REFERENCES sets(id) ON DELETE CASCADE,
  queue int[] NOT NULL DEFAULT '{}',
  current_index int NOT NULL DEFAULT 0,
  known int[] NOT NULL DEFAULT '{}',
  unknown int[] NOT NULL DEFAULT '{}',
  history int[] NOT NULL DEFAULT '{}',
  is_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sets_folder_id ON sets(folder_id);
CREATE INDEX idx_cards_set_id ON cards(set_id);
CREATE INDEX idx_cards_set_position ON cards(set_id, position);
CREATE INDEX idx_attachments_card_id ON attachments(card_id);