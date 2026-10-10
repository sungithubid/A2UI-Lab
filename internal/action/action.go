package action

import (
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"

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

type Result struct {
	Events []event.Message
	Status string
}

// Route validates a capability and domain input independently of HTTP or rendering.
// Service checks the persisted lifecycle and makes the response/idempotency atomic.
func Route(a Envelope, runID, scenario string, question *event.ChoiceRequired) (Result, error) {
	invalid := func(message string) (Result, error) { return Result{}, fmt.Errorf("%w: %s", fault.ErrInvalid, message) }
	if a.Version != 1 || a.RunID != runID || a.SurfaceID != "main" || a.Category != "tool" {
		return invalid("action is not available for this run")
	}
	completed := func(message string, result any) event.Message {
		return event.New("action.completed", map[string]any{"action": a.Action, "category": a.Category, "message": message, "result": result})
	}
	switch scenario {
	case "server-health":
		if a.ComponentID != "view-errors" || a.Action != "view_errors" || len(a.Data) != 0 {
			return invalid("unknown health action")
		}
		return Result{Events: []event.Message{completed("Recent errors: connection timeout, retry exhausted, upstream unavailable.", []string{"connection timeout", "retry exhausted", "upstream unavailable"})}}, nil
	case "support-form":
		if a.ComponentID != "ticket-form" || a.Action != "submit_ticket" || len(a.Data) != 4 {
			return invalid("expected name, email, summary and priority")
		}
		values := map[string]string{}
		for key, limit := range map[string]int{"name": 80, "email": 254, "summary": 500, "priority": 6} {
			value, ok := a.Data[key].(string)
			value = strings.TrimSpace(value)
			if !ok || value == "" || utf8.RuneCountInString(value) > limit {
				return invalid("invalid " + key)
			}
			values[key] = value
		}
		address, err := mail.ParseAddress(values["email"])
		if err != nil || address.Address != values["email"] || !strings.Contains(address.Address, "@") {
			return invalid("enter a valid email address")
		}
		if values["priority"] != "normal" && values["priority"] != "urgent" {
			return invalid("invalid priority")
		}
		return Result{Status: "completed", Events: []event.Message{
			event.New("ticket.created", map[string]any{"ticketId": "ticket-" + runID, "values": values}),
			completed("Support ticket saved locally. No email was sent.", values),
			event.New("agent.completed", map[string]any{}),
		}}, nil
	case "plan-decision":
		if a.ComponentID != "plan-decision" || a.Action != "choose_plan" || question == nil {
			return invalid("plan decision is not available")
		}
		choiceID, ok := a.Data["choiceId"].(string)
		if !ok {
			return invalid("expected a choiceId")
		}
		title, text := "", ""
		if choiceID == "custom" {
			if !question.AllowCustom || len(a.Data) != 2 || question.CustomMaxLength < 1 || question.CustomMaxLength > 2000 {
				return invalid("custom input is not available")
			}
			text, ok = a.Data["text"].(string)
			text = strings.TrimSpace(text)
			if !ok || text == "" || utf8.RuneCountInString(text) > question.CustomMaxLength {
				return invalid("enter a custom plan within the character limit")
			}
			title = "Custom plan"
		} else {
			if len(a.Data) != 1 {
				return invalid("expected only a choiceId")
			}
			for _, option := range question.Options {
				if option.ID == choiceID {
					title = option.Title
					break
				}
			}
			if title == "" {
				return invalid("unknown plan choice")
			}
		}
		selection := map[string]any{"choiceId": choiceID, "title": title, "text": text}
		message := "Confirmed: " + title
		if text != "" {
			message += " — " + text
		}
		message += ". Mock recorded your choice. You can continue the conversation."
		return Result{Status: "completed", Events: []event.Message{
			event.New("decision.resolved", selection),
			event.New("agent.resumed", map[string]any{"reason": "plan confirmed"}),
			completed(message, map[string]any{"choiceId": choiceID, "title": title, "text": text, "question": question}),
			event.New("agent.completed", map[string]any{}),
		}}, nil
	case "deployment-approval":
		if a.ComponentID != "deployment-confirmation" || a.Action != "decide_deployment" || len(a.Data) != 1 {
			return invalid("expected one deployment decision")
		}
		decision, ok := a.Data["decision"].(string)
		if !ok || (decision != "approve" && decision != "reject") {
			return invalid("decision must be approve or reject")
		}
		messages := []event.Message{event.New("approval.resolved", map[string]any{"decision": decision})}
		status := "cancelled"
		message := "Deployment rejected. Nothing was executed."
		if decision == "approve" {
			status = "completed"
			message = "Mock deployment completed for checkout-api v2.4.0 in staging. No infrastructure was changed."
			messages = append(messages, event.New("agent.resumed", map[string]any{"reason": "human approval"}), event.New("tool.started", event.ToolStarted{CallID: "deploy", Name: "deploy_staging_mock", Args: map[string]any{"service": "checkout-api", "version": "v2.4.0"}}), event.New("tool.completed", event.ToolCompleted{CallID: "deploy", Name: "deploy_staging_mock", Result: map[string]any{"status": "deployed", "simulated": true}}))
		}
		messages = append(messages, completed(message, map[string]any{"decision": decision}), event.New("agent.completed", map[string]any{}))
		return Result{Status: status, Events: messages}, nil
	}
	return invalid("action is not available for this scenario")
}
