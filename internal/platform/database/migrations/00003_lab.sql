-- +goose Up
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  last_seq INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX runs_created_at ON runs(created_at DESC, id);
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  created_at TEXT NOT NULL,
  UNIQUE(run_id, seq)
);
-- +goose Down
-- Destructive reversal: removes all Lab run history. Back up before rollback.
DROP TABLE events;
DROP TABLE runs;
