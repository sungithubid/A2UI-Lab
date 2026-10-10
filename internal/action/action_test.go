package action

import (
	"strings"
	"testing"

	"github.com/sungithubid/A2UI-Lab/internal/event"
)

func TestMalformedInteractiveActions(t *testing.T) {
	valid := Envelope{Version: 1, RunID: "r", SurfaceID: "main", ComponentID: "ticket-form", Category: "tool", Action: "submit_ticket", Data: map[string]any{"name": "Ada", "email": "ada@example.test", "summary": "Help", "priority": "normal"}}
	for _, change := range []func(*Envelope){
		func(a *Envelope) { a.RunID = "other" }, func(a *Envelope) { a.SurfaceID = "elsewhere" }, func(a *Envelope) { a.ComponentID = "other" }, func(a *Envelope) { a.Category = "navigation" }, func(a *Envelope) { a.Data["name"] = " " }, func(a *Envelope) { a.Data["email"] = "Ada <ada@example.test>" }, func(a *Envelope) { a.Data["email"] = true }, func(a *Envelope) { a.Data["priority"] = "admin" }, func(a *Envelope) { a.Data["summary"] = strings.Repeat("x", 501) }, func(a *Envelope) { a.Data["extra"] = "unexpected" },
	} {
		a := valid
		a.Data = map[string]any{}
		for k, v := range valid.Data {
			a.Data[k] = v
		}
		change(&a)
		if _, err := Route(a, "r", "support-form", nil); err == nil {
			t.Fatal("malformed action accepted", a)
		}
	}
	if _, err := Route(valid, "r", "image-card", nil); err == nil {
		t.Fatal("form allowed on image scenario")
	}
}

func TestPlanActionUsesPersistedCandidatesAndValidatesCustomInput(t *testing.T) {
	q := &event.ChoiceRequired{Options: []event.ChoiceOption{{ID: "server-defined", Title: "Server title"}}, AllowCustom: true, CustomMaxLength: 500}
	a := Envelope{Version: 1, RunID: "r", SurfaceID: "main", ComponentID: "plan-decision", Category: "tool", Action: "choose_plan", Data: map[string]any{"choiceId": "server-defined"}}
	result, err := Route(a, "r", "plan-decision", q)
	if err != nil || result.Status != "completed" || result.Events[0].Payload["title"] != "Server title" {
		t.Fatal(result, err)
	}
	for _, data := range []map[string]any{
		{"choiceId": "invented"}, {"choiceId": true}, {"choiceId": "server-defined", "title": "Forged"},
		{"choiceId": "custom"}, {"choiceId": "custom", "text": " "}, {"choiceId": "custom", "text": true},
		{"choiceId": "custom", "text": strings.Repeat("字", 501)}, {"choiceId": "custom", "text": "Plan", "extra": 1},
	} {
		a.Data = data
		if _, err := Route(a, "r", "plan-decision", q); err == nil {
			t.Fatal("invalid plan accepted", data)
		}
	}
	a.Data = map[string]any{"choiceId": "custom", "text": "  自定义方案  "}
	result, err = Route(a, "r", "plan-decision", q)
	if err != nil || result.Events[0].Payload["text"] != "自定义方案" {
		t.Fatal(result, err)
	}
	q.AllowCustom = false
	if _, err := Route(a, "r", "plan-decision", q); err == nil {
		t.Fatal("custom choice was not disabled")
	}
	if _, err := Route(a, "r", "plan-decision", nil); err == nil {
		t.Fatal("missing persisted question accepted")
	}
}
