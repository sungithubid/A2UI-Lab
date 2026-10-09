package httpx

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRecoverAndTimeoutProblems(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	release := make(chan struct{})
	defer close(release)
	for _, tc := range []struct {
		name    string
		handler http.Handler
		status  int
	}{
		{"panic", http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("internal details") }), 500},
		{"timeout", http.TimeoutHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done(); <-release }), time.Millisecond, `{"status":503,"title":"Request timeout"}`), 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			Middleware(log, 128*1024)(tc.handler).ServeHTTP(w, httptest.NewRequest("GET", "/api/slow", nil))
			if w.Code != tc.status || w.Header().Get("Content-Type") != "application/problem+json" || strings.Contains(w.Body.String(), "internal details") {
				t.Fatalf("status=%d type=%s body=%s", w.Code, w.Header().Get("Content-Type"), w.Body.String())
			}
		})
	}
}
