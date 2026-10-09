package mock

import (
	"context"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/event"
)

type Agent struct{ Delay time.Duration }

func (a Agent) Run(ctx context.Context, req agent.Request) (<-chan event.Message, error) {
	messages := []event.Message{
		event.New("agent.started", map[string]any{"agent": "mock"}),
		event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: "Checking server metrics... "}),
	}
	if req.ScenarioID != "streaming-text" {
		messages = append(messages,
			event.New("tool.started", event.ToolStarted{CallID: "metrics", Name: "get_server_metrics", Args: map[string]any{}}),
			event.New("agent.progress", event.Progress{Message: "Collecting metrics", Percent: 50}),
		)
		if req.ScenarioID == "tool-error" {
			messages = append(messages, event.New("error.occurred", event.ErrorOccurred{Code: "metrics_unavailable", Message: "The mock metrics tool is unavailable. No external tool was called."}))
		} else {
			messages = append(messages,
				event.New("tool.completed", event.ToolCompleted{CallID: "metrics", Name: "get_server_metrics", Result: map[string]any{"cpu": 32, "memory": 61, "errors": 3}}),
				event.New("agent.progress", event.Progress{Message: "Analysis complete", Percent: 100}),
				event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: "The server is healthy, with 3 recent errors."}),
			)
		}
	} else {
		messages = append(messages, event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: "This deterministic stream works without a model or API key."}))
	}
	messages = append(messages, event.New("agent.completed", map[string]any{}))
	if scenario, ok := interactiveScenario(req.ScenarioID); ok {
		messages = scenario
	}
	out := make(chan event.Message)
	go func() {
		defer close(out)
		for _, m := range messages {
			select {
			case <-ctx.Done():
				return
			case <-time.After(a.Delay):
			}
			select {
			case <-ctx.Done():
				return
			case out <- m:
			}
		}
	}()
	return out, nil
}
