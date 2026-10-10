package mock

import (
	"context"
	"fmt"
	"strings"
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
	if req.ScenarioID == "streaming-text" {
		messages = []event.Message{event.New("agent.started", map[string]any{"agent": "mock"}), event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: "## Streaming Markdown\n\nThis **deterministic** answer streams without a model or API key.\n\n- Narrative uses Markdown deltas.\n- Interactive cards use A2UI.\n\n| Channel | Purpose |\n| --- | --- |\n| Markdown | Explanations and code |\n| A2UI | Forms, cards and decisions |\n\n```go\nfmt.Println(\"Hello, hybrid chat\")\n```\n"}), event.New("agent.completed", map[string]any{})}
	}
	// Follow-ups read the actual backend-built request. This is fixture behavior,
	// not simulated LLM reasoning or a claim that an external model was contacted.
	previous := ""
	for _, m := range req.Messages {
		if m.Role == "user" && m.SourceRunID != "" {
			previous = m.Content
		}
	}
	if previous != "" {
		var text strings.Builder
		text.WriteString("### Follow-up context\n\nThis is a deterministic Mock continuation.\n\nPrevious user message:\n\n")
		text.WriteString(quote(previous))
		text.WriteString("\n\nCurrent request:\n\n" + quote(req.Prompt) + "\n\n")
		if len(req.UIContext) > 0 {
			last := req.UIContext[len(req.UIContext)-1]
			fmt.Fprintf(&text, "Prior turn: **%s**, state: **%s**.\n\n", last.ScenarioID, last.Status)
			if len(last.Facts) > 0 {
				text.WriteString("Recorded UI facts:\n\n")
				for _, fact := range last.Facts {
					text.WriteString(quote(fact) + "\n\n")
				}
			}
		}
		intro := event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: text.String()})
		messages = append(messages[:1], append([]event.Message{intro}, messages[1:]...)...)
	}
	out := make(chan event.Message)
	go func() {
		defer close(out)
		for _, m := range messages {
			parts := []event.Message{m}
			delay := a.Delay
			if m.Kind == "model.text_delta" {
				text, _ := m.Payload["text"].(string)
				id, _ := m.Payload["messageId"].(string)
				runes := []rune(text)
				parts = nil
				for len(runes) > 0 {
					n := min(12, len(runes))
					parts = append(parts, event.New("model.text_delta", event.TextDelta{MessageID: id, Text: string(runes[:n])}))
					runes = runes[n:]
				}
				delay = min(delay, 25*time.Millisecond)
			}
			for _, part := range parts {
				select {
				case <-ctx.Done():
					return
				case <-time.After(delay):
				}
				select {
				case <-ctx.Done():
					return
				case out <- part:
				}
			}
		}
	}()
	return out, nil
}

func quote(s string) string {
	// Escape Markdown syntax in user/context text before putting it in a blockquote.
	r := strings.NewReplacer("\\", "\\\\", "`", "\\`", "*", "\\*", "_", "\\_", "[", "\\[", "]", "\\]", "<", "&lt;", ">", "&gt;", "#", "\\#", "|", "\\|")
	return "> " + strings.ReplaceAll(r.Replace(s), "\n", "\n> ")
}
