package a2ui

import (
	"fmt"
	"net/url"
	"strings"
)

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
func validateInteractive(c Component) error {
	v, ok := c.Value.(map[string]any)
	if !ok {
		return fmt.Errorf("%s needs an object value", c.Component)
	}
	if title, ok := v["title"].(string); !ok || title == "" {
		return fmt.Errorf("%s needs a title", c.Component)
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
