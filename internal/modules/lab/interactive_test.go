package lab

import (
	"context"
	"errors"
	"github.com/sungithubid/A2UI-Lab/internal/action"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
	"sync"
	"testing"
	"time"
)

func ready(t *testing.T, s *Service, scenario string) Run {
	t.Helper()
	r, err := s.Create(context.Background(), Create{Prompt: "Scenario test", ScenarioID: scenario})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		r, err = s.Get(context.Background(), r.ID)
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != "running" {
			return r
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("run did not become ready")
	return r
}
func TestInteractiveScenarios(t *testing.T) {
	for _, scenario := range []string{"image-card", "image-list", "support-form", "deployment-approval"} {
		t.Run(scenario, func(t *testing.T) {
			r, s := fixture(t)
			run := ready(t, s, scenario)
			events, err := s.Events(context.Background(), run.ID, 0)
			if err != nil {
				t.Fatal(err)
			}
			protocol := 0
			for _, e := range events {
				if e.Kind == "validation.error" {
					t.Fatalf("invalid protocol: %v", e.Payload)
				}
				if e.Kind == "a2ui.message" {
					protocol++
				}
			}
			if protocol < 2 {
				t.Fatal("scenario did not render")
			}
			if scenario == "support-form" || scenario == "deployment-approval" {
				if run.Status != "waiting_input" || run.FinishedAt != "" {
					t.Fatalf("not waiting: %+v", run)
				}
				if err = r.Recover(context.Background()); err != nil {
					t.Fatal(err)
				}
				again, _ := r.Get(context.Background(), run.ID)
				if again.Status != "waiting_input" || again.LastSeq != run.LastSeq {
					t.Fatal("recovery interrupted pending user input")
				}
			} else if run.Status != "completed" {
				t.Fatal(run.Status)
			}
		})
	}
}
func TestFormValidationPersistenceAndRetry(t *testing.T) {
	_, s := fixture(t)
	run := ready(t, s, "support-form")
	ctx := context.Background()
	a := action.Envelope{Version: 1, RunID: run.ID, SurfaceID: "main", ComponentID: "ticket-form", Category: "tool", Action: "submit_ticket", Data: map[string]any{"name": "Ada", "email": "invalid", "summary": "Broken export", "priority": "urgent"}}
	before, _ := s.Events(ctx, run.ID, 0)
	if _, err := s.Action(ctx, run.ID, a); !errors.Is(err, fault.ErrInvalid) {
		t.Fatal("invalid email accepted", err)
	}
	after, _ := s.Events(ctx, run.ID, 0)
	if len(before) != len(after) {
		t.Fatal("invalid form mutated stream")
	}
	a.Data["email"] = "ada@example.test"
	result, err := s.Action(ctx, run.ID, a)
	if err != nil || result.Status != "completed" || result.FinishedAt == "" {
		t.Fatal(result, err)
	}
	replay, _ := s.Events(ctx, run.ID, 0)
	seen := false
	for _, e := range replay {
		if e.Kind == "ticket.created" {
			seen = true
			v := e.Payload["values"].(map[string]any)
			if v["email"] != "ada@example.test" {
				t.Fatal(v)
			}
		}
	}
	if !seen {
		t.Fatal("ticket was not saved")
	}
	retry, err := s.Action(ctx, run.ID, a)
	if err != nil || retry.LastSeq != result.LastSeq {
		t.Fatal("retry appended events", err)
	}
	a.Data["summary"] = "Different issue"
	if _, err = s.Action(ctx, run.ID, a); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("changed resubmission accepted", err)
	}
}
func TestApprovalDecisionsAreExclusive(t *testing.T) {
	for _, decision := range []string{"approve", "reject"} {
		t.Run(decision, func(t *testing.T) {
			_, s := fixture(t)
			run := ready(t, s, "deployment-approval")
			ctx := context.Background()
			a := action.Envelope{Version: 1, RunID: run.ID, SurfaceID: "main", ComponentID: "deployment-confirmation", Category: "tool", Action: "decide_deployment", Data: map[string]any{"decision": decision}}
			var wg sync.WaitGroup
			results := make(chan error, 2)
			for i := 0; i < 2; i++ {
				wg.Add(1)
				go func() { defer wg.Done(); _, err := s.Action(ctx, run.ID, a); results <- err }()
			}
			wg.Wait()
			close(results)
			for err := range results {
				if err != nil {
					t.Fatal(err)
				}
			}
			events, _ := s.Events(ctx, run.ID, 0)
			resolved, tools := 0, 0
			for _, e := range events {
				if e.Kind == "approval.resolved" {
					resolved++
				}
				if e.Kind == "tool.started" {
					tools++
				}
			}
			r, _ := s.Get(ctx, run.ID)
			if resolved != 1 {
				t.Fatal("decision repeated", resolved)
			}
			if decision == "approve" {
				if r.Status != "completed" || tools != 1 {
					t.Fatal(r.Status, tools)
				}
			} else {
				if r.Status != "cancelled" || tools != 0 {
					t.Fatal("rejection executed tool", r.Status, tools)
				}
			}
			a.Data = map[string]any{"decision": map[string]string{"approve": "reject", "reject": "approve"}[decision]}
			if _, err := s.Action(ctx, run.ID, a); !errors.Is(err, fault.ErrConflict) {
				t.Fatal("contradictory decision accepted", err)
			}
		})
	}
}
