package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/event"
	"github.com/sungithubid/A2UI-Lab/internal/modules/lab"
	"github.com/sungithubid/A2UI-Lab/internal/platform/config"
)

func testApp(t *testing.T) *App {
	t.Helper()
	c := config.Defaults(t.TempDir())
	a, err := Open(context.Background(), c, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Close() })
	return a
}
func request(t *testing.T, a *App, method, path string, body any, status int) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	r.Host = "localhost:8080"
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.Handler.ServeHTTP(w, r)
	if w.Code != status {
		t.Fatalf("%s %s: %d want %d: %s", method, path, w.Code, status, w.Body.String())
	}
	return w
}
func TestLabLifecycleActionsReplayAndIsolation(t *testing.T) {
	a := testApp(t)
	request(t, a, "GET", "/healthz", nil, 200)
	request(t, a, "GET", "/readyz", nil, 200)
	request(t, a, "GET", "/api/workspaces", nil, 404)
	request(t, a, "POST", "/api/auth/login", nil, 404)
	request(t, a, "POST", "/api/runs", map[string]any{"prompt": "   ", "scenarioId": "server-health"}, 422)
	request(t, a, "POST", "/api/runs", map[string]any{"prompt": "hello", "scenarioId": "unknown"}, 422)
	request(t, a, "GET", "/api/runs/missing", nil, 404)
	request(t, a, "GET", "/api/scenarios", nil, 200)
	w := request(t, a, "POST", "/api/runs", lab.Create{Prompt: "Analyze server health", ScenarioID: "server-health"}, 201)
	var run lab.Run
	if err := json.Unmarshal(w.Body.Bytes(), &run); err != nil {
		t.Fatal(err)
	}
	base := "/api/runs/" + run.ID
	request(t, a, "DELETE", base, nil, 409)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		r, err := a.Lab.Get(context.Background(), run.ID)
		if err != nil {
			t.Fatal(err)
		}
		run = r
		if r.Status != "running" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if run.Status != "completed" {
		t.Fatalf("run not completed: %+v", run)
	}
	read := func() []event.Event {
		t.Helper()
		w := request(t, a, "GET", base+"/events", nil, 200)
		var out struct {
			Items []event.Event `json:"items"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out.Items
	}
	events := read()
	seen := map[string]bool{}
	for i, e := range events {
		if e.Seq != int64(i+1) || e.RunID != run.ID || !json.Valid(mustJSON(t, e.Payload)) {
			t.Fatalf("invalid event: %+v", e)
		}
		seen[e.Kind] = true
	}
	for _, kind := range []string{"run.started", "user.message", "agent.started", "model.text_delta", "tool.started", "tool.completed", "agent.progress", "presentation.event", "a2ui.message", "run.completed"} {
		if !seen[kind] {
			t.Errorf("missing %s", kind)
		}
	}
	if string(mustJSON(t, events)) != string(mustJSON(t, read())) {
		t.Fatal("replay read changed the canonical stream")
	}
	action := map[string]any{"version": 1, "runId": run.ID, "surfaceId": "main", "componentId": "view-errors", "category": "tool", "action": "view_errors", "data": map[string]any{}}
	action["runId"] = "other"
	request(t, a, "POST", base+"/actions", action, 422)
	action["runId"] = run.ID
	action["action"] = "execute_shell"
	request(t, a, "POST", base+"/actions", action, 422)
	action["action"] = "view_errors"
	request(t, a, "POST", base+"/actions", action, 200)
	after := read()
	if len(after) <= len(events) {
		t.Fatal("action not persisted")
	}
	request(t, a, "POST", base+"/actions", action, 200)
	if len(read()) != len(after) {
		t.Fatal("duplicate action appended twice")
	}
	other, err := a.Lab.Create(context.Background(), lab.Create{Prompt: "Other run", ScenarioID: "streaming-text"})
	if err != nil {
		t.Fatal(err)
	}
	isolated, err := a.Lab.Events(context.Background(), other.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range isolated {
		if e.RunID == run.ID {
			t.Fatal("cross-run leak")
		}
	}
	request(t, a, "DELETE", base, nil, 204)
	request(t, a, "GET", base+"/events", nil, 404)
	var count int
	if err = a.DB.QueryRow("SELECT count(*) FROM events WHERE run_id=?", run.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("events not cascade deleted", err)
	}
}
func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func TestLocalBoundaryBodyLimitAndTimeoutConfiguration(t *testing.T) {
	a := testApp(t)
	for _, tc := range []struct {
		host, origin, site string
		status             int
	}{{"localhost:8080", "http://evil.test", "", 403}, {"evil.test", "", "", 403}, {"localhost:8080", "", "cross-site", 403}, {"127.0.0.1:8080", "http://127.0.0.1:8080", "same-origin", 200}, {"localhost:8080", "", "", 200}} {
		r := httptest.NewRequest("GET", "/api/runs", nil)
		r.Host = tc.host
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Sec-Fetch-Site", tc.site)
		w := httptest.NewRecorder()
		a.Handler.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%+v: %d", tc, w.Code)
		}
	}
	r := httptest.NewRequest("POST", "/api/runs", strings.NewReader(`{}`))
	r.Host = "localhost:8080"
	r.Header.Set("Content-Type", "text/plain")
	w := httptest.NewRecorder()
	a.Handler.ServeHTTP(w, r)
	if w.Code != 415 {
		t.Fatal("simple cross-site POST accepted")
	}
	request(t, a, "POST", "/api/runs", map[string]any{"prompt": strings.Repeat("x", 9000), "scenarioId": "server-health"}, 413)
	server := a.httpServer()
	c := a.Config.HTTP
	if server.ReadHeaderTimeout != c.ReadHeaderTimeout || server.ReadTimeout != c.ReadTimeout || server.WriteTimeout != c.WriteTimeout || server.IdleTimeout != c.IdleTimeout || server.MaxHeaderBytes != c.MaxHeaderBytes {
		t.Fatal("configured limits not applied")
	}
	a.DB.Close()
	request(t, a, "GET", "/readyz", nil, 503)
}
func TestSSEFlushAndResume(t *testing.T) {
	a := testApp(t)
	run, err := a.Lab.Create(context.Background(), lab.Create{Prompt: "stream", ScenarioID: "streaming-text"})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(a.Handler)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", srv.URL+"/api/runs/"+run.ID+"/stream", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "localhost:8080"
	req.Header.Set("Last-Event-ID", "1")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatal("not an SSE response", response.Status)
	}
	buf := make([]byte, 4096)
	text := ""
	for !strings.Contains(text, "id: 2\n") {
		n, e := response.Body.Read(buf)
		text += string(buf[:n])
		if e != nil {
			t.Fatal("stream did not flush promptly", e, text)
		}
	}
	if strings.Contains(text, "id: 1\n") || !strings.Contains(text, "event: lab") {
		t.Fatal("resume cursor ignored", text)
	}
	request(t, a, "GET", "/api/runs/"+run.ID+"/stream?after=-1", nil, 400)
}

func TestMaintenanceOpenDoesNotInterruptRuns(t *testing.T) {
	a := testApp(t)
	repo := lab.NewRepository(a.DB)
	run, err := repo.Create(context.Background(), "Active run", "server-health", "v0.9.1")
	if err != nil {
		t.Fatal(err)
	}
	// CLI doctor/backup/migrate use Open, but only Serve may recover old runs.
	maintenance, err := Open(context.Background(), a.Config, a.Log)
	if err != nil {
		t.Fatal(err)
	}
	defer maintenance.Close()
	got, err := a.Lab.Get(context.Background(), run.ID)
	if err != nil || got.Status != "running" || got.LastSeq != 0 {
		t.Fatalf("maintenance changed active run: %+v %v", got, err)
	}
}

func TestDeleteAllRunsRequiresConfirmation(t *testing.T) {
	a := testApp(t)
	w := request(t, a, "POST", "/api/runs", lab.Create{Prompt: "Active run", ScenarioID: "server-health"}, 201)
	var run lab.Run
	if err := json.Unmarshal(w.Body.Bytes(), &run); err != nil {
		t.Fatal(err)
	}
	request(t, a, "DELETE", "/api/runs", map[string]any{}, 422)
	request(t, a, "DELETE", "/api/runs", map[string]any{"confirm": false}, 422)
	request(t, a, "GET", "/api/runs/"+run.ID, nil, 200)
	w = request(t, a, "DELETE", "/api/runs", map[string]any{"confirm": true}, 200)
	var result lab.DeleteAllResult
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Deleted != 1 {
		t.Fatal("incorrect deletion result", result, err)
	}
	request(t, a, "GET", "/api/runs/"+run.ID, nil, 404)
	request(t, a, "GET", "/api/runs/"+run.ID+"/events", nil, 404)
	w = request(t, a, "GET", "/api/runs", nil, 200)
	var history struct {
		Items []lab.Run `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &history); err != nil || len(history.Items) != 0 {
		t.Fatal("history not empty", history, err)
	}
	request(t, a, "POST", "/api/runs", lab.Create{Prompt: "Next run", ScenarioID: "streaming-text"}, 201)
}
