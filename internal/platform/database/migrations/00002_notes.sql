-- +goose Up
CREATE TABLE notes (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
 content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 20000),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX notes_workspace_created ON notes(workspace_id,created_at DESC,id DESC);
-- +goose Down
DROP TABLE notes;
