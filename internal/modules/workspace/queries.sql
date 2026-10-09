-- name: ListWorkspaces :many
SELECT w.id, w.name, m.role FROM workspaces w
JOIN workspace_members m ON m.workspace_id = w.id
WHERE m.user_id = sqlc.arg(user_id) ORDER BY w.created_at, w.id;

-- name: GetRole :one
SELECT role FROM workspace_members
WHERE workspace_id = sqlc.arg(workspace_id) AND user_id = sqlc.arg(user_id);

-- name: CreateWorkspace :exec
INSERT INTO workspaces (id, name, created_at)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(created_at));

-- name: CreateOwnerMembership :exec
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES (sqlc.arg(workspace_id), sqlc.arg(user_id), 'owner');
