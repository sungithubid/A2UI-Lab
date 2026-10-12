package lab

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/event"
)

func TestDeepThinkingOptionAcrossScenariosAndContextExclusion(t *testing.T) {
	repo, s := fixture(t)
	ctx := context.Background()
	for _, scenario := range Scenarios() {
		for _, enabled := range []bool{false, true} {
			r, err := s.Create(ctx, Create{Prompt: "Compare output channels", ScenarioID: scenario.ID, DeepThinking: enabled})
			if err != nil {
				t.Fatal(err)
			}
			r = finish(t, s, r.ID)
			events, err := repo.AllEvents(ctx, r.ID)
			if err != nil {
				t.Fatal(err)
			}
			var thinking, answer strings.Builder
			starts, ends := 0, 0
			for _, e := range events {
				switch e.Kind {
				case "run.started":
					if e.Payload["deepThinking"] != enabled {
						t.Fatal("run option not saved")
					}
				case "model.request":
					if e.Payload["request"].(map[string]any)["deepThinking"] != enabled {
						t.Fatal("adapter option not recorded")
					}
				case "model.reasoning_started":
					starts++
				case "model.reasoning_completed":
					ends++
				case "model.reasoning_delta":
					thinking.WriteString(e.Payload["text"].(string))
				case "model.text_delta":
					answer.WriteString(e.Payload["text"].(string))
				case "model.response":
					if e.Payload["reasoningCharacters"] != float64(utf8.RuneCountInString(thinking.String())) || e.Payload["outputCharacters"] != float64(utf8.RuneCountInString(answer.String())) {
						t.Fatal("reasoning counted as answer", e.Payload)
					}
				}
			}
			if enabled && (starts != 1 || ends != 1 || !strings.Contains(thinking.String(), "Mock planning summary")) {
				t.Fatal("missing thinking lifecycle", scenario.ID, starts, ends)
			}
			if !enabled && (starts != 0 || ends != 0 || thinking.Len() != 0) {
				t.Fatal("disabled thinking emitted content")
			}
			if scenario.ID == "streaming-text" {
				for _, e := range events {
					if e.Kind == "a2ui.message" {
						t.Fatal("text/thinking created a surface")
					}
				}
			}
			// Inspect buildRequest directly even for pending interactions. The public
			// continuation endpoint correctly rejects waiting_input predecessors.
			req, _, err := s.buildRequest(ctx, Create{Prompt: "Next turn", ScenarioID: "streaming-text"}, []Run{r})
			if err != nil {
				t.Fatal(err)
			}
			if req.DeepThinking || req.Messages[2].Content != answer.String() {
				t.Fatal("thinking option inherited or summary merged into answer")
			}
			encoded, _ := json.Marshal(req)
			if strings.Contains(string(encoded), "Mock planning summary") {
				t.Fatal("reasoning leaked into history")
			}
		}
	}
}

type thinkingAgent struct{ delivered chan struct{} }

func (a thinkingAgent) Run(ctx context.Context, _ agent.Request) (<-chan event.Message, error) {
	out := make(chan event.Message)
	go func() {
		defer close(out)
		for _, m := range []event.Message{
			event.New("model.reasoning_started", event.ReasoningStarted{MessageID: "think", Source: "mock_summary"}),
			event.New("model.reasoning_delta", event.TextDelta{MessageID: "think", Text: "Thinking only. "}),
			event.New("model.reasoning_delta", event.TextDelta{MessageID: "think", Text: "待保存的摘要🙂"}),
		} {
			select {
			case out <- m:
			case <-ctx.Done():
				return
			}
		}
		close(a.delivered)
		<-ctx.Done()
	}()
	return out, nil
}

func TestStopDuringThinkingPreservesItsTailAndCountsSeparately(t *testing.T) {
	repo, s := fixture(t)
	a := thinkingAgent{delivered: make(chan struct{})}
	s.agent = a
	r, err := s.Create(context.Background(), Create{Prompt: "Stop while thinking", ScenarioID: "streaming-text", DeepThinking: true})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-a.delivered:
	case <-time.After(3 * time.Second):
		t.Fatal("thinking did not arrive")
	}
	stopped, err := s.Stop(context.Background(), r.ID)
	if err != nil || stopped.Status != "interrupted" {
		t.Fatal(stopped, err)
	}
	events, err := repo.AllEvents(context.Background(), r.ID)
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	for _, e := range events {
		if e.Kind == "model.reasoning_delta" {
			text.WriteString(e.Payload["text"].(string))
		}
		if e.Kind == "model.reasoning_completed" || e.Kind == "model.text_delta" || e.Kind == "a2ui.message" {
			t.Fatal("stopped summary claimed completion or produced answer/UI", e)
		}
		if e.Kind == "model.response" && (e.Payload["outputCharacters"] != float64(0) || e.Payload["reasoningCharacters"] != float64(utf8.RuneCountInString(text.String()))) {
			t.Fatal("wrong character counts", e)
		}
	}
	if text.String() != "Thinking only. 待保存的摘要🙂" {
		t.Fatal("thinking buffer tail lost", text.String())
	}
	if events[len(events)-1].Kind != "run.interrupted" {
		t.Fatal("missing terminal state")
	}
}
