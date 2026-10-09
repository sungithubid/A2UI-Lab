package action

import (
	"fmt"

	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/fault"
)

type Envelope struct {
	Version     int            `json:"version" minimum:"1" maximum:"1"`
	RunID       string         `json:"runId" minLength:"1" maxLength:"100"`
	SurfaceID   string         `json:"surfaceId" minLength:"1" maxLength:"100"`
	ComponentID string         `json:"componentId" minLength:"1" maxLength:"100"`
	Category    string         `json:"category" enum:"local,agent,tool,navigation"`
	Action      string         `json:"action" minLength:"1" maxLength:"100"`
	Data        map[string]any `json:"data"`
}

// Route is an allowlist of actual capabilities, not arbitrary tool dispatch.
func Route(a Envelope, runID string, enabled bool) (event.Message, error) {
	if !enabled || a.Version != 1 || a.RunID != runID || a.SurfaceID != "main" || a.ComponentID != "view-errors" || a.Category != "tool" || a.Action != "view_errors" || len(a.Data) != 0 {
		return event.Message{}, fmt.Errorf("%w: action is not available for this run", fault.ErrInvalid)
	}
	return event.New("action.completed", map[string]any{"action": a.Action, "category": a.Category, "result": []string{"connection timeout", "retry exhausted", "upstream unavailable"}}), nil
}
