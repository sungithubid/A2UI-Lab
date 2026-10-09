package lab

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/agent/mock"
	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/database"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
)

func fixture(t *testing.T) (*Repository, *Service) {
	t.Helper()
	db, err := database.Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	r := NewRepository(db)
	s := NewService(r, mock.Agent{Delay: time.Millisecond}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(func() { s.Close(); db.Close() })
	return r, s
}
func TestConcurrentSequencePersistenceRecovery(t *testing.T) {
	r, _ := fixture(t)
	ctx := context.Background()
	run, err := r.Create(ctx, "test", "server-health", "v0.9.1")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- r.Append(ctx, run.ID, []event.Message{event.New("test.event", map[string]any{"value": 1})}, "")
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	events, err := r.Events(ctx, run.ID, 0)
	if err != nil || len(events) != 20 {
		t.Fatal(len(events), err)
	}
	for i, e := range events {
		if e.Seq != int64(i+1) {
			t.Fatal("unordered", e)
		}
	}
	before, _ := r.Get(ctx, run.ID)
	err = r.Append(ctx, run.ID, []event.Message{event.New("valid", map[string]any{}), {Kind: "invalid", Payload: map[string]any{"bad": make(chan int)}}}, "completed")
	if err == nil {
		t.Fatal("invalid JSON accepted")
	}
	after, _ := r.Get(ctx, run.ID)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("failed transaction partially committed")
	}
	if err = r.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	recovered, _ := r.Get(ctx, run.ID)
	if recovered.Status != "interrupted" || recovered.LastSeq != 21 {
		t.Fatal("recovery", recovered)
	}
	page, err := r.Events(ctx, run.ID, 20)
	if err != nil || len(page) != 1 || page[0].Kind != "run.interrupted" {
		t.Fatal("cursor", page, err)
	}
	reopened := NewRepository(r.db)
	again, _ := reopened.Events(ctx, run.ID, 0)
	if len(again) != 21 {
		t.Fatal("events not persisted")
	}
	if err = r.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	final, _ := r.Get(ctx, run.ID)
	if final.LastSeq != 21 {
		t.Fatal("recovery not idempotent")
	}
}
func TestServiceValidationFailureAndCancellation(t *testing.T) {
	_, s := fixture(t)
	ctx := context.Background()
	for _, in := range []Create{{Prompt: " ", ScenarioID: "server-health"}, {Prompt: "hello", ScenarioID: "unknown"}} {
		if _, err := s.Create(ctx, in); !errors.Is(err, fault.ErrInvalid) {
			t.Fatal("invalid service input", err)
		}
	}
	run, err := s.Create(ctx, Create{Prompt: "failure", ScenarioID: "tool-error"})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		run, err = s.Get(ctx, run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if run.Status != "running" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if run.Status != "failed" {
		t.Fatal(run.Status)
	}
	events, _ := s.Events(ctx, run.ID, 0)
	seen := false
	for _, e := range events {
		if e.Kind == "error.occurred" {
			seen = true
		}
	}
	if !seen {
		t.Fatal("failure disappeared")
	}
	s.Close()
	if _, err = s.Create(ctx, Create{Prompt: "closed", ScenarioID: "server-health"}); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("closed runtime accepted run")
	}
}
