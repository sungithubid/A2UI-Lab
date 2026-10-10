package agent

import (
	"context"

	"github.com/sungithubid/A2UI-Lab/internal/event"
)

type Request struct {
	Prompt     string        `json:"prompt"`
	ScenarioID string        `json:"scenarioId"`
	Messages   []ChatMessage `json:"messages"`
	UIContext  []UIContext   `json:"uiContext"`
}

// Application-owned context, not a provider-specific API or UI component tree.
type ChatMessage struct {
	Role        string `json:"role"`
	Content     string `json:"content"`
	SourceRunID string `json:"sourceRunId,omitempty"`
}
type UIContext struct {
	RunID      string   `json:"runId"`
	ScenarioID string   `json:"scenarioId"`
	Status     string   `json:"status"`
	Facts      []string `json:"facts"`
}

// Adapters own their output channel and close it on completion/cancellation.
// No Eino or presentation types cross this boundary.
type Agent interface {
	Run(context.Context, Request) (<-chan event.Message, error)
}
