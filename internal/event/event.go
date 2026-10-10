// Package event defines application-owned, JSON-serializable semantic events.
package event

import "encoding/json"

type Event struct {
	ID        string         `json:"id"`
	RunID     string         `json:"runId"`
	Seq       int64          `json:"seq"`
	Kind      string         `json:"kind"`
	Timestamp string         `json:"timestamp"`
	Payload   map[string]any `json:"payload"`
}
type Message struct {
	Kind    string
	Payload map[string]any
}

func New(kind string, payload any) Message {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	var body map[string]any
	if err = json.Unmarshal(data, &body); err != nil {
		panic(err)
	}
	return Message{Kind: kind, Payload: body}
}

type TextDelta struct {
	MessageID string `json:"messageId"`
	Text      string `json:"text"`
}
type ToolStarted struct {
	CallID string         `json:"callId"`
	Name   string         `json:"name"`
	Args   map[string]any `json:"args"`
}
type ToolCompleted struct {
	CallID string         `json:"callId"`
	Name   string         `json:"name"`
	Result map[string]any `json:"result"`
}
type Progress struct {
	Message string  `json:"message"`
	Percent float64 `json:"percent"`
}
type ErrorOccurred struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ChoiceRequired describes a semantic decision; it contains no rendering types.
type ChoiceOption struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Recommended bool   `json:"recommended"`
}
type ChoiceRequired struct {
	Title           string         `json:"title"`
	Description     string         `json:"description"`
	Options         []ChoiceOption `json:"options"`
	AllowCustom     bool           `json:"allowCustom"`
	CustomMaxLength int            `json:"customMaxLength"`
}
