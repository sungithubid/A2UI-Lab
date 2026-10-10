// Package a2ui isolates the supported v0.9.1 protocol subset and Lab catalog.
package a2ui

import (
	"fmt"

	"github.com/sungithubid/A2UI-Lab/internal/presentation"
)

type ProtocolVersion string

const Version ProtocolVersion = "v0.9.1"
const CatalogID = "https://github.com/sungithubid/A2UI-Lab/catalog/v1"

type Component struct {
	ID        string         `json:"id"`
	Component string         `json:"component"`
	Text      any            `json:"text,omitempty"`
	Children  []string       `json:"children,omitempty"`
	Child     string         `json:"child,omitempty"`
	Action    map[string]any `json:"action,omitempty"`
	Value     any            `json:"value,omitempty"`
	Disabled  bool           `json:"disabled,omitempty"`
	Percent   *float64       `json:"percent,omitempty"`
}
type Surface struct {
	SurfaceID string `json:"surfaceId"`
	CatalogID string `json:"catalogId"`
}
type Components struct {
	SurfaceID  string      `json:"surfaceId"`
	Components []Component `json:"components"`
}
type DataModel struct {
	SurfaceID string `json:"surfaceId"`
	Path      string `json:"path"`
	Value     any    `json:"value"`
}
type Delete struct {
	SurfaceID string `json:"surfaceId"`
}
type Message struct {
	Version          ProtocolVersion `json:"version"`
	CreateSurface    *Surface        `json:"createSurface,omitempty"`
	UpdateComponents *Components     `json:"updateComponents,omitempty"`
	UpdateDataModel  *DataModel      `json:"updateDataModel,omitempty"`
	DeleteSurface    *Delete         `json:"deleteSurface,omitempty"`
}

func Validate(m Message) error {
	if m.Version != Version {
		return fmt.Errorf("unsupported protocol version %q", m.Version)
	}
	count := 0
	id := ""
	if m.CreateSurface != nil {
		count++
		id = m.CreateSurface.SurfaceID
		if m.CreateSurface.CatalogID != CatalogID {
			return fmt.Errorf("unsupported catalog")
		}
	}
	if m.UpdateComponents != nil {
		count++
		id = m.UpdateComponents.SurfaceID
		seen := map[string]bool{}
		for _, c := range m.UpdateComponents.Components {
			if c.ID == "" || seen[c.ID] {
				return fmt.Errorf("empty or duplicate component ID")
			}
			seen[c.ID] = true
			switch c.Component {
			case "Text":
				if c.Text == nil {
					return fmt.Errorf("Text needs text")
				}
			case "Column", "Row":
				if c.Children == nil {
					return fmt.Errorf("container needs children")
				}
			case "Card", "Button":
				if c.Child == "" {
					return fmt.Errorf("component needs child")
				}
			case "LabImageCard", "LabForm", "LabApproval":
				if err := validateInteractive(c); err != nil {
					return err
				}
			case "LabToolCall", "LabToolResult", "LabProgress", "LabAlert":
			default:
				return fmt.Errorf("unknown component: %s", c.Component)
			}
		}
	}
	if m.UpdateDataModel != nil {
		count++
		id = m.UpdateDataModel.SurfaceID
		if m.UpdateDataModel.Path != "/" {
			return fmt.Errorf("this Lab subset only supports root data replacement")
		}
	}
	if m.DeleteSurface != nil {
		count++
		id = m.DeleteSurface.SurfaceID
	}
	if count != 1 || id == "" {
		return fmt.Errorf("expected one message and a nonempty surfaceId")
	}
	return nil
}

// Presenter owns the adjacency-list view, separate from semantic presentation.
type Presenter struct {
	children []string
	seen     map[string]bool
}

func (p *Presenter) Start() Message {
	p.seen = map[string]bool{}
	p.children = nil
	return Message{Version: Version, CreateSurface: &Surface{SurfaceID: "main", CatalogID: CatalogID}}
}
func (p *Presenter) Render(m presentation.Model) []Message {
	// Narrative deltas use the Markdown channel. Text inside cards still uses A2UI.
	if m.Kind == "text-delta" {
		return nil
	}
	if !p.seen[m.ID] {
		p.seen[m.ID] = true
		p.children = append(p.children, m.ID)
	}
	c := Component{ID: m.ID, Text: m.Text}
	extra := []Component{}
	switch m.Kind {
	case "text":
		c.Component = "Text"
	case "tool-call":
		c.Component = "LabToolCall"
		c.Value = m.Data
	case "tool-result":
		c.Component = "LabToolResult"
		c.Value = m.Data
	case "progress":
		c.Component = "LabProgress"
		c.Percent = &m.Percent
	case "error":
		c.Component = "LabAlert"
	case "image-card", "image-row":
		c.Component = "LabImageCard"
		c.Text = nil
		c.Value = m.Data
		if m.Kind == "image-row" {
			c.Value = cloneWith(m.Data, "layout", "row")
		}
	case "form":
		c = ticketForm(nil, false)
	case "approval":
		c = approval(m.Data, false)
	case "health":
		c.Component = "Card"
		c.Text = nil
		c.Child = "health-content"
		extra = []Component{
			{ID: "health-content", Component: "Column", Children: []string{"health-title", "health-summary", "view-errors"}},
			{ID: "health-title", Component: "Text", Text: "Server health"},
			{ID: "health-summary", Component: "Text", Text: map[string]string{"path": "/summary"}},
			{ID: "view-errors", Component: "Button", Child: "view-errors-label", Action: map[string]any{"event": map[string]any{"name": "view_errors", "context": map[string]any{}}}},
			{ID: "view-errors-label", Component: "Text", Text: "View errors"},
		}
	}
	components := []Component{{ID: "root", Component: "Column", Children: append([]string{}, p.children...)}, c}
	components = append(components, extra...)
	out := []Message{{Version: Version, UpdateComponents: &Components{SurfaceID: "main", Components: components}}}
	if m.Kind == "health" {
		out = append(out, Message{Version: Version, UpdateDataModel: &DataModel{SurfaceID: "main", Path: "/", Value: map[string]any{"summary": m.Data["summary"]}}})
	}
	return out
}

// ActionResult renders a semantic result on its own surface. It is called once by
// the idempotent Action Router; protocol-specific shapes stay in this adapter.
func ActionResult(view presentation.Model) []Message {
	// The action receipt is distinct from the original interactive surface.
	if view.Kind != "action-result" {
		return nil
	}
	surfaceID := view.ID
	out := []Message{
		{Version: Version, CreateSurface: &Surface{SurfaceID: surfaceID, CatalogID: CatalogID}},
		{Version: Version, UpdateComponents: &Components{SurfaceID: surfaceID, Components: []Component{{ID: "root", Component: "Text", Text: view.Text}}}},
	}
	switch view.Data["action"] {
	case "submit_ticket":
		out = append(out, Message{Version: Version, UpdateComponents: &Components{SurfaceID: "main", Components: []Component{ticketForm(view.Data["result"], true)}}})
	case "decide_deployment":
		out = append(out, Message{Version: Version, UpdateComponents: &Components{SurfaceID: "main", Components: []Component{approval(map[string]any{"title": "Decision recorded", "description": view.Text, "decision": view.Data["result"].(map[string]any)["decision"]}, true)}}})
	}
	return out
}
