package webui

import (
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPARoutingAndCaching(t *testing.T) {
	handler := serve(fstest.MapFS{"index.html": {Data: []byte("<!doctype html><h1>App</h1>")}, "assets/index-abc123.js": {Data: []byte("console.log('app')")}})
	for _, tc := range []struct {
		path        string
		status      int
		cache, body string
	}{
		{"/", 200, "no-cache", "<h1>App</h1>"}, {"/notes/deep", 200, "no-cache", "<h1>App</h1>"}, {"/index.html", 200, "no-cache", "<h1>App</h1>"},
		{"/assets/index-abc123.js", 200, "public, max-age=31536000, immutable", "console.log"}, {"/assets/missing.js", 404, "", "404"}, {"/missing.js", 404, "", "404"}, {"/api/missing", 404, "", "404"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
			if w.Code != tc.status || w.Header().Get("Cache-Control") != tc.cache || !strings.Contains(w.Body.String(), tc.body) {
				t.Fatalf("status=%d cache=%s body=%s", w.Code, w.Header().Get("Cache-Control"), w.Body.String())
			}
		})
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("HEAD", "/notes", nil))
	if w.Code != 200 || w.Body.Len() != 0 {
		t.Fatal("HEAD returned a body")
	}
}
