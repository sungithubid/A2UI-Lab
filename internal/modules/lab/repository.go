package lab

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/modules/lab/dbgen"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
	"github.com/sungithubid/A2UI-Lab/internal/platform/security"
)

type Run struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	ScenarioID      string `json:"scenarioId"`
	Mode            string `json:"mode"`
	Status          string `json:"status"`
	ProtocolVersion string `json:"protocolVersion"`
	AgentType       string `json:"agentType"`
	CreatedAt       string `json:"createdAt"`
	FinishedAt      string `json:"finishedAt"`
	LastSeq         int64  `json:"lastSeq"`
}
type Repository struct {
	db *sql.DB
	q  *dbgen.Queries
}

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db, q: dbgen.New(db)} }
func model(r dbgen.Run) Run {
	return Run{r.ID, r.Title, r.ScenarioID, r.Mode, r.Status, r.ProtocolVersion, r.AgentType, r.CreatedAt, r.FinishedAt, r.LastSeq}
}
func dbError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fault.ErrNotFound
	}
	return err
}
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }
func (r *Repository) Create(ctx context.Context, title, scenario, version string) (Run, error) {
	v, err := r.q.CreateRun(ctx, dbgen.CreateRunParams{ID: security.Token(), Title: title, ScenarioID: scenario, ProtocolVersion: version, CreatedAt: now()})
	return model(v), err
}
func (r *Repository) Get(ctx context.Context, id string) (Run, error) {
	v, err := r.q.GetRun(ctx, id)
	return model(v), dbError(err)
}
func (r *Repository) List(ctx context.Context, offset int) ([]Run, error) {
	rows, err := r.q.ListRuns(ctx, dbgen.ListRunsParams{PageSize: 100, PageOffset: int64(offset)})
	out := []Run{}
	for _, v := range rows {
		out = append(out, model(v))
	}
	return out, err
}
func (r *Repository) Events(ctx context.Context, id string, after int64) ([]event.Event, error) {
	if _, err := r.Get(ctx, id); err != nil {
		return nil, err
	}
	rows, err := r.q.ListEvents(ctx, dbgen.ListEventsParams{RunID: id, AfterSeq: after, PageSize: 1000})
	if err != nil {
		return nil, err
	}
	out := []event.Event{}
	for _, v := range rows {
		var p map[string]any
		if err = json.Unmarshal([]byte(v.PayloadJson), &p); err != nil {
			return nil, err
		}
		out = append(out, event.Event{ID: v.ID, RunID: v.RunID, Seq: v.Seq, Kind: v.Kind, Payload: p, Timestamp: v.CreatedAt})
	}
	return out, nil
}

// Append allocates sequence numbers and updates status atomically with the batch.
func (r *Repository) Append(ctx context.Context, id string, messages []event.Message, status string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	q := r.q.WithTx(tx)
	v, err := q.GetRun(ctx, id)
	if err != nil {
		return dbError(err)
	}
	for _, m := range messages {
		payload, err := json.Marshal(m.Payload)
		if err != nil {
			return err
		}
		v.LastSeq++
		if err = q.AppendEvent(ctx, dbgen.AppendEventParams{ID: security.Token(), RunID: id, Seq: v.LastSeq, Kind: m.Kind, PayloadJson: string(payload), CreatedAt: now()}); err != nil {
			return err
		}
	}
	if status != "" {
		v.Status = status
		if status != "running" && status != "waiting_input" {
			v.FinishedAt = now()
		}
	}
	if err = q.UpdateRun(ctx, dbgen.UpdateRunParams{ID: id, LastSeq: v.LastSeq, Status: v.Status, FinishedAt: v.FinishedAt}); err != nil {
		return err
	}
	return tx.Commit()
}
func (r *Repository) Recover(ctx context.Context) error {
	rows, err := r.q.RunningRuns(ctx)
	if err != nil {
		return err
	}
	for _, v := range rows {
		if err = r.Append(ctx, v.ID, []event.Message{event.New("run.interrupted", map[string]any{"reason": "process stopped before completion"})}, "interrupted"); err != nil {
			return err
		}
	}
	return nil
}
func (r *Repository) Delete(ctx context.Context, id string) error {
	n, err := r.q.DeleteRun(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		if _, err = r.Get(ctx, id); err != nil {
			return err
		}
		return fmt.Errorf("%w: running runs cannot be deleted", fault.ErrConflict)
	}
	return nil
}

// DeleteAll atomically deletes every run; the existing foreign key cascades events.
func (r *Repository) DeleteAll(ctx context.Context) (int64, error) { return r.q.DeleteAllRuns(ctx) }
