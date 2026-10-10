-- +goose Up
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO conversations(id,title,created_at) SELECT id,title,created_at FROM runs;
ALTER TABLE runs ADD COLUMN conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE runs ADD COLUMN turn_index INTEGER NOT NULL DEFAULT 1;
UPDATE runs SET conversation_id=id;
CREATE UNIQUE INDEX runs_conversation_turn ON runs(conversation_id,turn_index);

-- +goose Down
-- Conversation grouping is lost; runs and events are preserved.
DROP INDEX runs_conversation_turn;
ALTER TABLE runs DROP COLUMN conversation_id;
ALTER TABLE runs DROP COLUMN turn_index;
DROP TABLE conversations;
