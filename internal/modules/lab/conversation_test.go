package lab

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/action"
	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/agent/mock"
	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
)

type recordingAgent struct{ requests chan agent.Request }

func (a recordingAgent) Run(ctx context.Context, r agent.Request) (<-chan event.Message, error) {
	a.requests <- r
	return (mock.Agent{Delay: time.Millisecond}).Run(ctx, r)
}
func finish(t *testing.T, s *Service, id string) Run {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		r, err := s.Get(context.Background(), id)
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != "running" {
			return r
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("turn did not finish")
	return Run{}
}
func TestConversationContextTraceAndIsolation(t *testing.T) {
	repo, s := fixture(t)
	ctx := context.Background()
	spy := recordingAgent{requests: make(chan agent.Request, 10)}
	s.agent = spy
	first, err := s.Create(ctx, Create{Prompt: "My first question", ScenarioID: "server-health"})
	if err != nil {
		t.Fatal(err)
	}
	finish(t, s, first.ID)
	<-spy.requests
	other := ready(t, s, "image-card")
	<-spy.requests
	next, err := s.Create(ctx, Create{Prompt: "What did I ask before?", ScenarioID: "streaming-text", ConversationID: first.ConversationID, ParentRunID: first.ID})
	if err != nil {
		t.Fatal(err)
	}
	if next.TurnIndex != 2 || next.ConversationID != first.ConversationID {
		t.Fatal(next)
	}
	finish(t, s, next.ID)
	actual := <-spy.requests
	if len(actual.Messages) != 4 || actual.Messages[1].Content != "My first question" || actual.Messages[2].Role != "assistant" || actual.Messages[3].Content != "What did I ask before?" {
		t.Fatal(actual.Messages)
	}
	if len(actual.UIContext) != 1 || actual.UIContext[0].RunID != first.ID || !strings.Contains(strings.Join(actual.UIContext[0].Facts, ""), "cpu") {
		t.Fatal(actual.UIContext)
	}
	events, err := repo.AllEvents(ctx, next.ID)
	if err != nil {
		t.Fatal(err)
	}
	var recorded agent.Request
	var text strings.Builder
	found := false
	for _, e := range events {
		if e.Kind == "model.request" {
			b, _ := json.Marshal(e.Payload["request"])
			if err = json.Unmarshal(b, &recorded); err != nil {
				t.Fatal(err)
			}
			found = true
		}
		if e.Kind == "a2ui.message" {
			t.Fatal("pure text must not emit UI snapshots")
		}
		if e.Kind == "model.text_delta" {
			text.WriteString(e.Payload["text"].(string))
		}
	}
	if !found || !reflect.DeepEqual(recorded, actual) {
		t.Fatal("trace differs from the actual adapter request", recorded, actual)
	}
	if !strings.Contains(text.String(), "My first question") || !strings.Contains(text.String(), "```go") {
		t.Fatal("mock ignored context or Markdown", text.String())
	}
	data, _ := json.Marshal(actual)
	if strings.Contains(string(data), other.ID) || strings.Contains(string(data), "updateComponents") {
		t.Fatal("cross-conversation or UI-tree leak")
	}
	history, err := NewRepository(repo.db).Conversation(ctx, first.ConversationID)
	if err != nil || len(history) != 2 || history[0].ID != first.ID || history[1].ID != next.ID {
		t.Fatal(history, err)
	}
	if _, err = s.Create(ctx, Create{Prompt: "Wrong parent", ScenarioID: "streaming-text", ConversationID: first.ConversationID, ParentRunID: other.ID}); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("foreign parent accepted", err)
	}
	if _, err = s.Action(ctx, first.ID, action.Envelope{Version: 1, RunID: first.ID, SurfaceID: "main", ComponentID: "view-errors", Category: "tool", Action: "view_errors", Data: map[string]any{}}); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("earlier UI remained mutable", err)
	}
}
func TestContinuationSerializationAndPendingInput(t *testing.T) {
	_, s := fixture(t)
	ctx := context.Background()
	pending := ready(t, s, "support-form")
	if _, err := s.Create(ctx, Create{Prompt: "Skip", ScenarioID: "streaming-text", ConversationID: pending.ConversationID, ParentRunID: pending.ID}); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("pending input skipped", err)
	}
	_, err := s.Action(ctx, pending.ID, action.Envelope{Version: 1, RunID: pending.ID, SurfaceID: "main", ComponentID: "ticket-form", Category: "tool", Action: "submit_ticket", Data: map[string]any{"name": "Private Name", "email": "private@example.test", "summary": "Sensitive details", "priority": "normal"}})
	if err != nil {
		t.Fatal(err)
	}
	req, _, err := s.buildRequest(ctx, Create{Prompt: "Continue", ScenarioID: "streaming-text"}, []Run{pending})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(req)
	for _, secret := range []string{"Private Name", "private@example.test", "Sensitive details"} {
		if strings.Contains(string(b), secret) {
			t.Fatal("contact input leaked to model context", secret)
		}
	}
	in := Create{Prompt: "Continue", ScenarioID: "streaming-text", ConversationID: pending.ConversationID, ParentRunID: pending.ID}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.Create(ctx, in); results <- err }()
	}
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, fault.ErrConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatal("concurrent continuations branched", success, conflict)
	}
}
func TestContextWindowAndCompleteEventPagination(t *testing.T) {
	repo, s := fixture(t)
	ctx := context.Background()
	history := []Run{}
	for i := 0; i < 10; i++ {
		r, err := repo.Create(ctx, "History", "streaming-text", "v0.9.1")
		if err != nil {
			t.Fatal(err)
		}
		if err = repo.Append(ctx, r.ID, []event.Message{event.New("model.text_delta", event.TextDelta{MessageID: "a", Text: "Saved answer"})}, "completed"); err != nil {
			t.Fatal(err)
		}
		history = append(history, r)
	}
	req, info, err := s.buildRequest(ctx, Create{Prompt: "Next", ScenarioID: "streaming-text"}, history)
	if err != nil || info.OmittedTurns != 2 || len(info.SourceRunIDs) != 8 || len(req.Messages) != 18 {
		t.Fatal(req, info, err)
	}
	batch := []event.Message{}
	for i := 0; i < 1001; i++ {
		batch = append(batch, event.New("model.text_delta", event.TextDelta{MessageID: "long", Text: "x"}))
	}
	if err = repo.Append(ctx, history[9].ID, batch, ""); err != nil {
		t.Fatal(err)
	}
	req, _, err = s.buildRequest(ctx, Create{Prompt: "Next", ScenarioID: "streaming-text"}, history[9:])
	if err != nil || req.Messages[2].Content != "Saved answer"+strings.Repeat("x", 1001) {
		t.Fatal("context silently truncated at an event page", err)
	}
	if err = repo.Append(ctx, history[9].ID, []event.Message{event.New("model.text_delta", event.TextDelta{MessageID: "long", Text: strings.Repeat("x", contextByteLimit)})}, ""); err != nil {
		t.Fatal(err)
	}
	req, info, err = s.buildRequest(ctx, Create{Prompt: "Next", ScenarioID: "streaming-text"}, history)
	encoded, marshalErr := json.Marshal(req)
	if err != nil || marshalErr != nil || len(encoded) > contextByteLimit || info.OmittedTurns != 10 || len(req.Messages) != 2 {
		t.Fatal("oversized history exceeded the budget or was silently trimmed", info, len(encoded), err, marshalErr)
	}
}
