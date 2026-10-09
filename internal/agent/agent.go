package agent

import (
	"context"

	"github.com/sungithubid/A2UI-Lab/internal/event"
)

type Request struct {
	Prompt     string
	ScenarioID string
}

// Adapters own their output channel and close it on completion/cancellation.
// No Eino or presentation types cross this boundary.
type Agent interface {
	Run(context.Context, Request) (<-chan event.Message, error)
}
