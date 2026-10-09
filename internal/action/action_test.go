package action

import (
	"strings"
	"testing"
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
		if _, err := Route(a, "r", "support-form"); err == nil {
			t.Fatal("malformed action accepted", a)
		}
	}
	if _, err := Route(valid, "r", "image-card"); err == nil {
		t.Fatal("form allowed on image scenario")
	}
}
