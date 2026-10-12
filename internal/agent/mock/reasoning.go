package mock

import "github.com/sungithubid/A2UI-Lab/internal/event"

// Displayable fixture summaries are separate from the answer. They are not an
// external model's private reasoning, nor evidence of work actually performed.
func reasoning(scenario string) []event.Message {
	approach := map[string]string{
		"server-health":       "Compare the saved CPU, memory and error fixtures, then show a bound status card and an optional error-details action.",
		"streaming-text":      "Keep the explanation in Markdown, including a list, table and code example. A text-only answer needs no A2UI surface.",
		"tool-error":          "Show the simulated tool failure explicitly and preserve the partial response for inspection and replay.",
		"stream-error":        "Demonstrate an incomplete Markdown answer before a simulated upstream failure, preserving all text that arrived.",
		"image-card":          "Pair the resource description with a bundled illustration and a safe documentation link.",
		"image-list":          "Present the three resource fixtures progressively using a thumbnail on the left and text on the right.",
		"support-form":        "Collect only the fields required by the local support-ticket demo, validate them on the server, then preserve the submitted result.",
		"deployment-approval": "Describe the proposed staging operation and wait for approval or rejection before recording a simulated outcome.",
		"plan-decision":       "Compare incremental migration with a full rebuild, recommend the smaller compatibility risk, and ask the user to choose or enter a custom plan.",
	}[scenario]
	return []event.Message{
		event.New("model.reasoning_started", event.ReasoningStarted{MessageID: "thinking-1", Source: "mock_summary"}),
		event.New("model.reasoning_delta", event.TextDelta{MessageID: "thinking-1", Text: "**Mock planning summary**\n\n" + approach + "\n\nThis fixed summary demonstrates the reasoning channel. No external model or hidden reasoning was used."}),
		event.New("model.reasoning_completed", event.ReasoningCompleted{MessageID: "thinking-1"}),
	}
}
