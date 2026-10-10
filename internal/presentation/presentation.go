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
type Presenter struct{}

func (p *Presenter) Present(e event.Message) []Model {
	str := func(k string) string { v, _ := e.Payload[k].(string); return v }
	switch e.Kind {
	case "model.text_delta":
		return []Model{{Kind: "text-delta", ID: str("messageId"), Text: str("text")}}
	case "tool.started":
		return []Model{{Kind: "tool-call", ID: "tool", Text: str("name"), Data: e.Payload}}
	case "resource.recommended":
		return []Model{{Kind: "image-card", ID: "recommendation", Data: e.Payload}}
	case "resource.found":
		return []Model{{Kind: "image-row", ID: fmt.Sprintf("resource-%v", e.Payload["index"]), Data: e.Payload["resource"].(map[string]any)}}
	case "input.required":
		return []Model{{Kind: "form", ID: "ticket-form", Data: e.Payload}}
	case "decision.required":
		return []Model{{Kind: "choice", ID: "plan-decision", Data: e.Payload}}
	case "approval.required":
		return []Model{{Kind: "approval", ID: "deployment-confirmation", Data: e.Payload}}
	case "tool.completed":
		if str("name") != "get_server_metrics" {
			return []Model{{Kind: "tool-result", ID: "result", Text: str("name"), Data: e.Payload}}
		}
		result, _ := e.Payload["result"].(map[string]any)
		summary := fmt.Sprintf("CPU %v%% · Memory %v%% · %v recent errors", result["cpu"], result["memory"], result["errors"])
		return []Model{{Kind: "tool-result", ID: "result", Text: str("name"), Data: e.Payload}, {Kind: "health", ID: "health", Text: "Server health", Data: map[string]any{"summary": summary}}}
	case "agent.progress":
		n, _ := e.Payload["percent"].(float64)
		return []Model{{Kind: "progress", ID: "progress", Text: str("message"), Percent: n}}
	case "error.occurred":
		return []Model{{Kind: "error", ID: "error", Text: str("message")}}
	case "action.completed":
		id := "action-result"
		if str("action") == "view_errors" {
			id = "errors"
		}
		return []Model{{Kind: "action-result", ID: id, Text: str("message"), Data: e.Payload}}
	}
	return nil
}
