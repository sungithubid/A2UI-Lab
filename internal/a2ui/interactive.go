package a2ui

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/sungithubid/A2UI-Lab/internal/event"
)

var choiceIDPattern = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}$`)

func cloneWith(data map[string]any, key string, value any) map[string]any {
	out := map[string]any{}
	for k, v := range data {
		out[k] = v
	}
	out[key] = value
	return out
}
func eventAction(name string) map[string]any {
	return map[string]any{"event": map[string]any{"name": name, "context": map[string]any{}}}
}
func ticketForm(values any, disabled bool) Component {
	return Component{ID: "ticket-form", Component: "LabForm", Disabled: disabled, Action: eventAction("submit_ticket"), Value: map[string]any{
		"title": "Create a support ticket", "description": "Demo ticket saved only in this run. No external service or email is used.", "values": values,
		"fields": []map[string]any{
			{"name": "name", "label": "Your name", "type": "text", "required": true, "maxLength": 80},
			{"name": "email", "label": "Email", "type": "email", "required": true, "maxLength": 254},
			{"name": "summary", "label": "Issue summary", "type": "textarea", "required": true, "maxLength": 500},
			{"name": "priority", "label": "Priority", "type": "select", "required": true, "options": []string{"normal", "urgent"}},
		},
	}}
}
func approval(data map[string]any, disabled bool) Component {
	return Component{ID: "deployment-confirmation", Component: "LabApproval", Disabled: disabled, Action: eventAction("decide_deployment"), Value: data}
}
func choice(data map[string]any, disabled bool) Component {
	return Component{ID: "plan-decision", Component: "LabChoice", Disabled: disabled, Action: eventAction("choose_plan"), Value: data}
}
func validateInteractive(c Component) error {
	v, ok := c.Value.(map[string]any)
	if !ok {
		return fmt.Errorf("%s needs an object value", c.Component)
	}
	if title, ok := v["title"].(string); !ok || title == "" {
		return fmt.Errorf("%s needs a title", c.Component)
	}
	if c.Component == "LabChoice" {
		data, err := json.Marshal(v)
		if err != nil {
			return err
		}
		var raw map[string]any
		if err = json.Unmarshal(data, &raw); err != nil {
			return err
		}
		if _, ok := raw["allowCustom"].(bool); !ok {
			return fmt.Errorf("choice needs allowCustom")
		}
		if options, ok := raw["options"].([]any); ok {
			for _, option := range options {
				v, ok := option.(map[string]any)
				if !ok {
					return fmt.Errorf("choice option needs an object")
				}
				if _, ok = v["recommended"].(bool); !ok {
					return fmt.Errorf("choice needs recommended flags")
				}
			}
		}
		var question event.ChoiceRequired
		if err = json.Unmarshal(data, &question); err != nil {
			return fmt.Errorf("invalid choice data: %w", err)
		}
		if question.Description == "" || len(question.Options) < 2 || len(question.Options) > 6 || question.CustomMaxLength < 1 || question.CustomMaxLength > 2000 {
			return fmt.Errorf("invalid choice question")
		}
		seen := map[string]bool{}
		for _, option := range question.Options {
			if !choiceIDPattern.MatchString(option.ID) || option.ID == "custom" || seen[option.ID] || option.Title == "" || option.Description == "" {
				return fmt.Errorf("invalid or duplicate choice option")
			}
			seen[option.ID] = true
		}
		if c.Disabled {
			id, ok := v["selectedChoiceId"].(string)
			text, textOK := v["customText"].(string)
			if !ok || (!seen[id] && !(id == "custom" && question.AllowCustom)) || !textOK || (id == "custom" && (strings.TrimSpace(text) == "" || utf8.RuneCountInString(text) > question.CustomMaxLength)) || (id != "custom" && text != "") {
				return fmt.Errorf("invalid recorded choice")
			}
		} else if _, exists := v["selectedChoiceId"]; exists {
			return fmt.Errorf("unlocked choice cannot have a selection")
		}
	}
	if c.Component == "LabImageCard" {
		u, err := url.Parse(fmt.Sprint(v["url"]))
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
			return fmt.Errorf("image card needs an HTTPS link")
		}
		image, ok := v["image"].(string)
		if !ok || !strings.HasPrefix(image, "/scenario-images/") || strings.Contains(image, "..") {
			return fmt.Errorf("image must be a bundled scenario asset")
		}
		if alt, ok := v["alt"].(string); !ok || alt == "" {
			return fmt.Errorf("image needs alternative text")
		}
	} else {
		if c.Action == nil {
			return fmt.Errorf("interactive component needs an action")
		}
	}
	return nil
}
