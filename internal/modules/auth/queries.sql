-- name: GetCredentials :one
SELECT id, email, password_hash FROM users WHERE email = sqlc.arg(email);

-- name: CreateAdminUser :execrows
INSERT INTO users (id, email, password_hash, created_at)
VALUES (sqlc.arg(id), sqlc.arg(email), sqlc.arg(password_hash), sqlc.arg(created_at))
ON CONFLICT(email) DO NOTHING;

-- name: CreateAdminWorkspace :exec
INSERT INTO workspaces (id, name, created_at)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(created_at));

-- name: CreateAdminMembership :exec
INSERT INTO workspace_members (workspace_id, user_id, role)
VALUES (sqlc.arg(workspace_id), sqlc.arg(user_id), 'owner');

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= sqlc.arg(expires_at);

-- name: TrimUserSessions :exec
DELETE FROM sessions WHERE sessions.user_id = sqlc.arg(user_id)
AND sessions.token_hash NOT IN (
  SELECT kept.token_hash FROM sessions AS kept WHERE kept.user_id = sqlc.arg(user_id)
  ORDER BY kept.expires_at DESC LIMIT 9
);

-- name: SaveSession :exec
INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at)
VALUES (sqlc.arg(token_hash), sqlc.arg(user_id), sqlc.arg(csrf_token), sqlc.arg(expires_at));

-- name: GetSession :one
SELECT u.id, u.email, s.csrf_token, s.expires_at FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = sqlc.arg(token_hash) AND s.expires_at > sqlc.arg(expires_at);

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = sqlc.arg(token_hash);
