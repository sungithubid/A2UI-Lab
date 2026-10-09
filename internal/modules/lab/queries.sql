-- name: CreateRun :one
INSERT INTO runs(id,title,scenario_id,mode,status,protocol_version,agent_type,created_at)
VALUES(sqlc.arg(id),sqlc.arg(title),sqlc.arg(scenario_id),'deterministic','running',sqlc.arg(protocol_version),'mock',sqlc.arg(created_at)) RETURNING *;
-- name: GetRun :one
SELECT * FROM runs WHERE id=sqlc.arg(id);
-- name: ListRuns :many
SELECT * FROM runs ORDER BY created_at DESC,id LIMIT sqlc.arg(page_size) OFFSET sqlc.arg(page_offset);
-- name: RunningRuns :many
SELECT * FROM runs WHERE status='running';
-- name: AppendEvent :exec
INSERT INTO events(id,run_id,seq,kind,payload_json,created_at)
VALUES(sqlc.arg(id),sqlc.arg(run_id),sqlc.arg(seq),sqlc.arg(kind),sqlc.arg(payload_json),sqlc.arg(created_at));
-- name: UpdateRun :exec
UPDATE runs SET last_seq=sqlc.arg(last_seq),status=sqlc.arg(status),finished_at=sqlc.arg(finished_at) WHERE id=sqlc.arg(id);
-- name: ListEvents :many
SELECT * FROM events WHERE run_id=sqlc.arg(run_id) AND seq>sqlc.arg(after_seq) ORDER BY seq LIMIT sqlc.arg(page_size);
-- name: DeleteRun :execrows
DELETE FROM runs WHERE id=sqlc.arg(id) AND status!='running';

-- name: DeleteAllRuns :execrows
DELETE FROM runs;
