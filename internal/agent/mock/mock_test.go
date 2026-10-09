package mock

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/agent"
	"github.com/sungithubid/A2UI-Lab/internal/event"
)

func TestDeterminismAndCancellation(t *testing.T) {
	a := Agent{}
	read := func() []event.Message {
		ch, err := a.Run(context.Background(), agent.Request{ScenarioID: "server-health"})
		if err != nil {
			t.Fatal(err)
		}
		out := []event.Message{}
		for e := range ch {
			out = append(out, e)
		}
		return out
	}
	first := read()
	if len(first) < 8 || !reflect.DeepEqual(first, read()) {
		t.Fatal("mock is not deterministic")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	ch, _ := (Agent{Delay: time.Hour}).Run(ctx, agent.Request{})
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("emitted after cancel")
		}
	case <-time.After(time.Second):
		t.Fatal("agent leaked")
	}
}
