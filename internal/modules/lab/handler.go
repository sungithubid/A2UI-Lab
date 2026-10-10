package lab

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"

	"github.com/sungithubid/A2UI-Lab/internal/action"
	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/platform/httpx"
)

type ItemInput struct {
	ID string `path:"id"`
}
type DeleteAllInput struct {
	Body struct {
		Confirm bool `json:"confirm"`
	}
}
type DeleteAllOutput struct{ Body DeleteAllResult }
type RunOutput struct{ Body Run }
type CreateInput struct{ Body Create }
type ActionInput struct {
	ItemInput
	Body action.Envelope
}
type ListInput struct {
	Offset int `query:"offset" minimum:"0" default:"0" maximum:"1000000"`
}
type EventsInput struct {
	ItemInput
	After int64 `query:"after" minimum:"0" default:"0"`
}
type RunsOutput struct {
	Body struct {
		Items []Run `json:"items" nullable:"false"`
	}
}
type EventsOutput struct {
	Body struct {
		Items []event.Event `json:"items" nullable:"false"`
	}
}
type ScenariosOutput struct {
	Body struct {
		Items []Scenario `json:"items" nullable:"false"`
	}
}

func Register(api huma.API, s *Service) {
	huma.Register(api, huma.Operation{OperationID: "get-run-conversation", Method: "GET", Path: "/api/runs/{id}/conversation"}, func(ctx context.Context, in *ItemInput) (*RunsOutput, error) {
		out := &RunsOutput{}
		var err error
		out.Body.Items, err = s.Conversation(ctx, in.ID)
		return out, httpx.Error(err)
	})
	huma.Register(api, huma.Operation{OperationID: "delete-all-runs", Method: "DELETE", Path: "/api/runs", MaxBodyBytes: 1024, Summary: "Stop and delete all runs and their events"}, func(ctx context.Context, in *DeleteAllInput) (*DeleteAllOutput, error) {
		result, err := s.DeleteAll(ctx, in.Body.Confirm)
		return &DeleteAllOutput{Body: result}, httpx.Error(err)
	})
	huma.Register(api, huma.Operation{OperationID: "create-run", Method: "POST", Path: "/api/runs", DefaultStatus: 201, MaxBodyBytes: 8192}, func(ctx context.Context, in *CreateInput) (*RunOutput, error) {
		r, e := s.Create(ctx, in.Body)
		return &RunOutput{Body: r}, httpx.Error(e)
	})
	huma.Register(api, huma.Operation{OperationID: "list-runs", Method: "GET", Path: "/api/runs"}, func(ctx context.Context, in *ListInput) (*RunsOutput, error) {
		o := &RunsOutput{}
		var e error
		o.Body.Items, e = s.List(ctx, in.Offset)
		return o, httpx.Error(e)
	})
	huma.Register(api, huma.Operation{OperationID: "get-run", Method: "GET", Path: "/api/runs/{id}"}, func(ctx context.Context, in *ItemInput) (*RunOutput, error) {
		r, e := s.Get(ctx, in.ID)
		return &RunOutput{Body: r}, httpx.Error(e)
	})
	huma.Register(api, huma.Operation{OperationID: "delete-run", Method: "DELETE", Path: "/api/runs/{id}", DefaultStatus: 204}, func(ctx context.Context, in *ItemInput) (*struct{}, error) {
		return nil, httpx.Error(s.Delete(ctx, in.ID))
	})
	huma.Register(api, huma.Operation{OperationID: "list-events", Method: "GET", Path: "/api/runs/{id}/events"}, func(ctx context.Context, in *EventsInput) (*EventsOutput, error) {
		o := &EventsOutput{}
		var e error
		o.Body.Items, e = s.Events(ctx, in.ID, in.After)
		return o, httpx.Error(e)
	})
	huma.Register(api, huma.Operation{OperationID: "run-action", Method: "POST", Path: "/api/runs/{id}/actions", MaxBodyBytes: 8192}, func(ctx context.Context, in *ActionInput) (*RunOutput, error) {
		r, e := s.Action(ctx, in.ID, in.Body)
		return &RunOutput{Body: r}, httpx.Error(e)
	})
	huma.Register(api, huma.Operation{OperationID: "list-scenarios", Method: "GET", Path: "/api/scenarios"}, func(ctx context.Context, in *struct{}) (*ScenariosOutput, error) {
		o := &ScenariosOutput{}
		o.Body.Items = Scenarios()
		return o, nil
	})
}

// Stream is a raw HTTP SSE adapter. REST /events is also available for replay.
// Bounded windows avoid disabling the server's write timeout. EventSource resumes
// using Last-Event-ID. Persisted sequence numbers are the only source of truth.
func Stream(s *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		after := int64(0)
		cursor := r.Header.Get("Last-Event-ID")
		if cursor == "" {
			cursor = r.URL.Query().Get("after")
		}
		if cursor != "" {
			n, e := strconv.ParseInt(cursor, 10, 64)
			if e != nil || n < 0 {
				httpx.Problem(w, 400, "Invalid event cursor")
				return
			}
			after = n
		}
		if _, err := s.Get(r.Context(), id); err != nil {
			httpx.Problem(w, 404, "Run not found")
			return
		}
		f, ok := w.(http.Flusher)
		if !ok {
			httpx.Problem(w, 500, "Streaming unavailable")
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		fmt.Fprint(w, "retry: 500\n\n")
		f.Flush()
		deadline := time.NewTimer(10 * time.Second)
		defer deadline.Stop()
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		for {
			events, err := s.Events(r.Context(), id, after)
			if err != nil {
				return
			}
			for _, e := range events {
				data, err := json.Marshal(e)
				if err != nil {
					return
				}
				if _, err = fmt.Fprintf(w, "id: %d\nevent: lab\ndata: %s\n\n", e.Seq, data); err != nil {
					return
				}
				after = e.Seq
			}
			f.Flush()
			select {
			case <-r.Context().Done():
				return
			case <-deadline.C:
				return
			case <-tick.C:
			}
		}
	}
}
