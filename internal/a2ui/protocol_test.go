package a2ui

import (
	"testing"

	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/presentation"
)

func TestSemanticPresentationProtocolBoundary(t *testing.T) {
	var semantic presentation.Presenter
	var adapter Presenter
	if err := Validate(adapter.Start()); err != nil {
		t.Fatal(err)
	}
	inputs := []event.Message{event.New("model.text_delta", event.TextDelta{Text: "hello "}), event.New("model.text_delta", event.TextDelta{Text: "world"}), event.New("tool.started", event.ToolStarted{Name: "get_server_metrics"}), event.New("agent.progress", event.Progress{Message: "loading", Percent: 50}), event.New("tool.completed", event.ToolCompleted{Name: "get_server_metrics", Result: map[string]any{"cpu": 32}})}
	count := 0
	textDeltas := []string{}
	for _, input := range inputs {
		for _, m := range semantic.Present(input) {
			if m.Kind == "text-delta" {
				textDeltas = append(textDeltas, m.Text)
				if len(adapter.Render(m)) != 0 {
					t.Fatal("narrative leaked into A2UI")
				}
			}
			for _, msg := range adapter.Render(m) {
				if err := Validate(msg); err != nil {
					t.Fatal(err)
				}
				count++
			}
		}
	}
	if count != 5 || len(textDeltas) != 2 || textDeltas[0] != "hello " || textDeltas[1] != "world" {
		t.Fatal("mapping missing")
	}
}
func TestMalformedProtocol(t *testing.T) {
	for _, m := range []Message{{Version: "old", CreateSurface: &Surface{"main", CatalogID}}, {Version: Version}, {Version: Version, CreateSurface: &Surface{"", CatalogID}}, {Version: Version, CreateSurface: &Surface{"main", "unknown"}}, {Version: Version, CreateSurface: &Surface{"main", CatalogID}, DeleteSurface: &Delete{"main"}}, {Version: Version, UpdateComponents: &Components{"main", []Component{{ID: "x", Component: "Unknown"}}}}, {Version: Version, UpdateComponents: &Components{"main", []Component{{ID: "x", Component: "Text"}}}}} {
		if Validate(m) == nil {
			t.Fatalf("accepted malformed: %+v", m)
		}
	}
}

func TestChoiceProtocolRejectsIncompleteAndInvalidSelections(t *testing.T) {
	question := event.ChoiceRequired{Title: "Choose", Description: "Analysis complete", Options: []event.ChoiceOption{{ID: "first", Title: "First", Description: "Incremental", Recommended: true}, {ID: "second", Title: "Second", Description: "Rebuild"}}, AllowCustom: true, CustomMaxLength: 500}
	for _, change := range []func(*Component){
		func(c *Component) { delete(c.Value.(map[string]any), "allowCustom") },
		func(c *Component) { c.Value.(map[string]any)["customMaxLength"] = 0 },
		func(c *Component) { c.Value.(map[string]any)["options"] = []any{} },
		func(c *Component) {
			v := c.Value.(map[string]any)
			options := v["options"].([]any)
			options[1] = options[0]
		},
		func(c *Component) {
			delete(c.Value.(map[string]any)["options"].([]any)[0].(map[string]any), "recommended")
		},
		func(c *Component) { c.Value.(map[string]any)["selectedChoiceId"] = "first" },
		func(c *Component) {
			c.Disabled = true
			v := c.Value.(map[string]any)
			v["selectedChoiceId"] = "unknown"
			v["customText"] = ""
		},
		func(c *Component) {
			c.Disabled = true
			v := c.Value.(map[string]any)
			v["selectedChoiceId"] = "custom"
			v["customText"] = " "
		},
	} {
		c := choice(event.New("decision.required", question).Payload, false)
		change(&c)
		if err := Validate(Message{Version: Version, UpdateComponents: &Components{SurfaceID: "main", Components: []Component{c}}}); err == nil {
			t.Fatal("invalid choice accepted", c)
		}
	}
	for _, id := range []string{"first", "custom"} {
		data := event.New("decision.required", question).Payload
		data["selectedChoiceId"] = id
		data["customText"] = ""
		if id == "custom" {
			data["customText"] = "My plan"
		}
		if err := Validate(Message{Version: Version, UpdateComponents: &Components{SurfaceID: "main", Components: []Component{choice(data, true)}}}); err != nil {
			t.Fatal(err)
		}
	}
}
