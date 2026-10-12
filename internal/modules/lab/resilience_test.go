package lab

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/agent/mock"
	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
)

// Synchronize on delivery rather than sleep: the second delta is pending when
// Stop is requested, and the producer cannot finish without cancellation.
type pendingTextAgent struct{ delivered chan struct{} }

func (a pendingTextAgent) Run(ctx context.Context, _ agent.Request) (<-chan event.Message, error) {
	out := make(chan event.Message)
	go func() {
		defer close(out)
		for _, text := range []string{"First chunk. ", "Buffered tail."} {
			select {
			case out <- event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: text}):
			case <-ctx.Done():
				return
			}
		}
		close(a.delivered)
		<-ctx.Done()
	}()
	return out, nil
}

func TestStopDrainsTextIsIdempotentAndPreservesFollowUpContext(t *testing.T) {
	repo, s := fixture(t)
	ctx := context.Background()
	a := pendingTextAgent{delivered: make(chan struct{})}
	s.agent = a
	r, err := s.Create(ctx, Create{Prompt: "Stop a partial answer", ScenarioID: "streaming-text"})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-a.delivered:
	case <-time.After(3 * time.Second):
		t.Fatal("agent did not deliver text")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := s.Stop(cancelled, r.ID); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled request changed execution", err)
	}
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			stopped, err := s.Stop(ctx, r.ID)
			if err != nil || stopped.Status != "interrupted" || stopped.FinishedAt == "" {
				t.Error("stop did not acknowledge terminal persistence", stopped, err)
			}
		})
	}
	wg.Wait()
	s.wg.Wait()
	before, err := repo.AllEvents(ctx, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	stops, ends := 0, 0
	for i, e := range before {
		if e.Seq != int64(i+1) {
			t.Fatal("event gap", e)
		}
		if e.Kind == "model.text_delta" {
			text.WriteString(e.Payload["text"].(string))
		}
		if e.Kind == "runtime.stop_requested" {
			stops++
		}
		if e.Kind == "run.interrupted" {
			ends++
		}
	}
	if text.String() != "First chunk. Buffered tail." || stops != 1 || ends != 1 || before[len(before)-1].Kind != "run.interrupted" {
		t.Fatal("stop lost text or appended duplicate terminal events", text.String(), stops, ends)
	}
	if _, err := s.Stop(ctx, r.ID); err != nil {
		t.Fatal(err)
	}
	after, _ := repo.AllEvents(ctx, r.ID)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("retry changed event history")
	}
	s.agent = mock.Agent{}
	next, err := s.Create(ctx, Create{Prompt: "What arrived before the stop?", ScenarioID: "streaming-text", ConversationID: r.ConversationID, ParentRunID: r.ID})
	if err != nil {
		t.Fatal(err)
	}
	finish(t, s, next.ID)
	requestEvents, _ := repo.AllEvents(ctx, next.ID)
	for _, e := range requestEvents {
		if e.Kind != "model.request" {
			continue
		}
		req := e.Payload["request"].(map[string]any)
		messages := req["messages"].([]any)
		if messages[2].(map[string]any)["content"] != text.String() {
			t.Fatal("partial text missing from context", req)
		}
		ui := req["uiContext"].([]any)
		if ui[0].(map[string]any)["status"] != "interrupted" {
			t.Fatal("interrupted status missing", req)
		}
		return
	}
	t.Fatal("follow-up request not recorded")
}

func TestStopRejectsPendingAndFinishedRunsWithoutWrites(t *testing.T) {
	repo, s := fixture(t)
	for _, scenario := range []string{"support-form", "plan-decision", "server-health"} {
		r := ready(t, s, scenario)
		before, _ := repo.AllEvents(context.Background(), r.ID)
		if _, err := s.Stop(context.Background(), r.ID); !errors.Is(err, fault.ErrConflict) {
			t.Fatal("inactive run accepted stop", scenario, err)
		}
		after, _ := repo.AllEvents(context.Background(), r.ID)
		if !reflect.DeepEqual(before, after) {
			t.Fatal("rejected stop mutated events")
		}
	}
	if _, err := s.Stop(context.Background(), "missing"); !errors.Is(err, fault.ErrNotFound) {
		t.Fatal("missing stop", err)
	}
}

func TestPartialStreamFailureFlushesBeforeError(t *testing.T) {
	repo, s := fixture(t)
	r := ready(t, s, "stream-error")
	if r.Status != "failed" {
		t.Fatal("stream failure not marked failed", r)
	}
	events, err := repo.AllEvents(context.Background(), r.ID)
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	errorSeen := false
	for _, e := range events {
		if e.Kind == "model.text_delta" {
			if errorSeen {
				t.Fatal("text persisted after error")
			}
			text.WriteString(e.Payload["text"].(string))
		}
		if e.Kind == "error.occurred" {
			errorSeen = true
		}
		if e.Kind == "agent.completed" {
			t.Fatal("failed fixture claimed completion")
		}
	}
	if !errorSeen || !strings.HasSuffix(text.String(), "**the next part never arrives") {
		t.Fatal("partial text not flushed", text.String())
	}
	if events[len(events)-1].Kind != "run.failed" {
		t.Fatal("missing failed terminal event")
	}
}
