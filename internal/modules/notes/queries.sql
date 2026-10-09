-- name: CreateNote :one
INSERT INTO notes (id, workspace_id, title, content, created_at, updated_at)
VALUES (sqlc.arg(id), sqlc.arg(workspace_id), sqlc.arg(title), sqlc.arg(content), sqlc.arg(created_at), sqlc.arg(updated_at))
RETURNING *;

-- name: GetNote :one
SELECT * FROM notes WHERE workspace_id = sqlc.arg(workspace_id) AND id = sqlc.arg(id);

-- name: CountNotes :one
SELECT count(*) FROM notes WHERE workspace_id = sqlc.arg(workspace_id);

-- name: ListNotes :many
SELECT * FROM notes WHERE workspace_id = sqlc.arg(workspace_id)
ORDER BY created_at DESC, id DESC LIMIT sqlc.arg(page_size) OFFSET sqlc.arg(page_offset);

-- name: UpdateNote :one
UPDATE notes SET title = sqlc.arg(title), content = sqlc.arg(content), updated_at = sqlc.arg(updated_at)
WHERE workspace_id = sqlc.arg(workspace_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: DeleteNote :execrows
DELETE FROM notes WHERE workspace_id = sqlc.arg(workspace_id) AND id = sqlc.arg(id);
