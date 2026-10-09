// Package presentation maps semantic events to an application-owned display model.
// It has no A2UI or Agent-adapter dependencies.
package presentation

import (
	"fmt"

	"github.com/sungithubid/A2UI-Lab/internal/event"
)

type Model struct {
	Kind    string         `json:"kind"`
	ID      string         `json:"id"`
	Text    string         `json:"text"`
	Data    map[string]any `json:"data,omitempty"`
	Percent float64        `json:"percent,omitempty"`
}
type Presenter struct{ text string }

func (p *Presenter) Present(e event.Message) []Model {
	str := func(k string) string { v, _ := e.Payload[k].(string); return v }
	switch e.Kind {
	case "model.text_delta":
		p.text += str("text")
		return []Model{{Kind: "text", ID: "answer", Text: p.text}}
	case "tool.started":
		return []Model{{Kind: "tool-call", ID: "tool", Text: str("name"), Data: e.Payload}}
	case "tool.completed":
		result, _ := e.Payload["result"].(map[string]any)
		summary := fmt.Sprintf("CPU %v%% · Memory %v%% · %v recent errors", result["cpu"], result["memory"], result["errors"])
		return []Model{{Kind: "tool-result", ID: "result", Text: str("name"), Data: e.Payload}, {Kind: "health", ID: "health", Text: "Server health", Data: map[string]any{"summary": summary}}}
	case "agent.progress":
		n, _ := e.Payload["percent"].(float64)
		return []Model{{Kind: "progress", ID: "progress", Text: str("message"), Percent: n}}
	case "error.occurred":
		return []Model{{Kind: "error", ID: "error", Text: str("message")}}
	case "action.completed":
		return []Model{{Kind: "text", ID: "errors", Text: "Recent errors: connection timeout, retry exhausted, upstream unavailable."}}
	}
	return nil
}
