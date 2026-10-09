package mock

import "github.com/sungithubid/A2UI-Lab/internal/event"

func resource(title, description, image, url string) map[string]any {
	return map[string]any{"title": title, "description": description, "image": image, "alt": title + " illustration", "url": url}
}
func interactiveScenario(id string) ([]event.Message, bool) {
	start := event.New("agent.started", map[string]any{"agent": "mock"})
	end := event.New("agent.completed", map[string]any{})
	intro := func(text string) event.Message {
		return event.New("model.text_delta", event.TextDelta{MessageID: "answer", Text: text})
	}
	switch id {
	case "image-card":
		return []event.Message{start, intro("Here is a resource to explore. Open the image card to read the official documentation."), event.New("resource.recommended", resource("Build with A2UI", "Explore a declarative protocol for interactive Agent interfaces.", "/scenario-images/protocol.svg", "https://a2ui.org/")), end}, true
	case "image-list":
		items := []map[string]any{
			resource("A2UI protocol", "Inspect the messages behind a streaming interface.", "/scenario-images/protocol.svg", "https://a2ui.org/"),
			resource("React foundations", "Practice components, state, and user interactions.", "/scenario-images/interface.svg", "https://react.dev/learn"),
			resource("SQLite reference", "Learn how the Lab keeps its event history locally.", "/scenario-images/storage.svg", "https://www.sqlite.org/docs.html"),
		}
		out := []event.Message{start, intro("I found three useful engineering resources. Results arrive one at a time.")}
		for i, item := range items {
			out = append(out, event.New("resource.found", map[string]any{"index": i, "resource": item}))
		}
		return append(out, end), true
	case "support-form":
		return []event.Message{start, intro("Describe your issue and submit a local demo support ticket. No email is sent."), event.New("input.required", map[string]any{"purpose": "support-ticket", "title": "Create a support ticket", "description": "Demo ticket saved only in this run. No external service or email is used."}), event.New("agent.waiting", map[string]any{"reason": "form submission"})}, true
	case "deployment-approval":
		return []event.Message{start, intro("The staging deployment is prepared. I will wait for your decision before continuing."), event.New("approval.required", map[string]any{"title": "Deploy release v2.4.0?", "description": "Review this simulated deployment. Approval records a mock deployment; rejection stops it. No infrastructure is changed.", "operation": "Deploy v2.4.0", "environment": "Staging", "service": "checkout-api"}), event.New("agent.waiting", map[string]any{"reason": "human approval"})}, true
	}
	return nil, false
}
