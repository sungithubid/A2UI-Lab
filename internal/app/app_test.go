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

	"github.com/danielgtaylor/huma/v2"

	"monoseed/internal/modules/auth"
	"monoseed/internal/modules/notes"
	"monoseed/internal/modules/workspace"
	"monoseed/internal/platform/config"
)

func testApp(t *testing.T) *App {
	t.Helper()
	c := config.Defaults(t.TempDir())
	c.Addr = "127.0.0.1:0"
	c.SessionTTL = time.Hour
	a, err := Open(context.Background(), c, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { a.Close() })
	return a
}

type client struct {
	t      *testing.T
	a      *App
	cookie string
	csrf   string
}

func (c *client) request(method, path string, body any, status int) *httptest.ResponseRecorder {
	c.t.Helper()
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", c.a.Config.Origin)
	if c.cookie != "" {
		r.Header.Set("Cookie", c.cookie)
	}
	r.Header.Set("X-CSRF-Token", c.csrf)
	w := httptest.NewRecorder()
	c.a.Handler.ServeHTTP(w, r)
	if w.Code != status {
		c.t.Fatalf("%s %s: status=%d want=%d body=%s", method, path, w.Code, status, w.Body.String())
	}
	return w
}

func (c *client) login(email string) {
	c.t.Helper()
	w := c.request("POST", "/api/auth/login", map[string]string{"email": email, "password": "test password 12345"}, 200)
	var out auth.MeBody
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		c.t.Fatal(err)
	}
	c.csrf = out.CSRFToken
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		c.t.Fatal("unsafe cookie")
	}
	c.cookie = cookies[0].Name + "=" + cookies[0].Value
}

func (c *client) workspaces() []workspace.Workspace {
	w := c.request("GET", "/api/workspaces", nil, 200)
	var out struct {
		Items []workspace.Workspace `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		c.t.Fatal(err)
	}
	return out.Items
}

func TestAPIEndToEndAndWorkspaceIsolation(t *testing.T) {
	a := testApp(t)
	ctx := context.Background()
	for _, email := range []string{"owner@example.com", "outsider@example.com"} {
		if _, err := a.Auth.CreateAdmin(ctx, email, "test password 12345", "Workspace"); err != nil {
			t.Fatal(err)
		}
	}
	c := client{t: t, a: a}
	c.request("GET", "/healthz", nil, 200)
	c.request("GET", "/readyz", nil, 200)
	c.request("GET", "/api/workspaces", nil, 401)
	c.login("owner@example.com")
	c.request("GET", "/api/auth/me", nil, 200)
	ws := c.workspaces()[0]
	base := "/api/workspaces/" + ws.ID + "/notes"
	c.request("POST", base, map[string]string{"title": "   ", "content": "x"}, 422)
	c.request("GET", base+"?page=0", nil, 422)
	savedCSRF := c.csrf
	c.csrf = "bad"
	c.request("POST", base, map[string]string{"title": "CSRF"}, 403)
	c.csrf = savedCSRF
	w := c.request("POST", base, map[string]string{"title": "Original", "content": "Secret"}, 201)
	var n notes.Note
	if err := json.Unmarshal(w.Body.Bytes(), &n); err != nil {
		t.Fatal(err)
	}
	c.request("GET", base+"/"+n.ID, nil, 200)
	c.request("PUT", base+"/"+n.ID, map[string]string{"title": "Updated", "content": "Kept"}, 200)
	page := c.request("GET", base+"?page=1&page_size=1", nil, 200)
	var p notes.Page
	if err := json.Unmarshal(page.Body.Bytes(), &p); err != nil || p.Total != 1 || len(p.Items) != 1 {
		t.Fatalf("pagination: %+v %v", p, err)
	}
	// Same user, different workspace: membership alone must not allow ID substitution.
	second := c.request("POST", "/api/workspaces", map[string]string{"name": "Second"}, 201)
	var secondWS workspace.Workspace
	if err := json.Unmarshal(second.Body.Bytes(), &secondWS); err != nil {
		t.Fatal(err)
	}
	wrongBase := "/api/workspaces/" + secondWS.ID + "/notes"
	c.request("GET", wrongBase+"/"+n.ID, nil, 404)
	c.request("PUT", wrongBase+"/"+n.ID, map[string]string{"title": "Hijacked", "content": ""}, 404)
	c.request("DELETE", wrongBase+"/"+n.ID, nil, 404)
	outsider := client{t: t, a: a}
	outsider.login("outsider@example.com")
	outsider.request("GET", base, nil, 403)
	outsider.request("GET", base+"/"+n.ID, nil, 403)
	outsider.request("POST", base, map[string]string{"title": "Attack", "content": ""}, 403)
	outsider.request("PUT", base+"/"+n.ID, map[string]string{"title": "Attack", "content": ""}, 403)
	outsider.request("DELETE", base+"/"+n.ID, nil, 403)
	// Revocation is effective on the very next request, even with an active session.
	user, _, err := auth.NewRepository(a.DB).Credentials(ctx, "owner@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.DB.Exec("DELETE FROM workspace_members WHERE user_id=? AND workspace_id=?", user.ID, secondWS.ID); err != nil {
		t.Fatal(err)
	}
	c.request("GET", wrongBase, nil, 403)
	c.request("DELETE", base+"/"+n.ID, nil, 204)
	c.request("GET", base+"/"+n.ID, nil, 404)
	c.request("POST", "/api/auth/logout", nil, 204)
	c.request("GET", "/api/auth/me", nil, 401)
}

func TestOriginRateLimitAndBodyLimit(t *testing.T) {
	a := testApp(t)
	for _, origin := range []string{"", "https://evil.test"} {
		r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"a@b.com","password":"p"}`))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		a.Handler.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("origin accepted: %d", w.Code)
		}
	}
	c := client{t: t, a: a}
	for i := 0; i < 10; i++ {
		c.request("POST", "/api/auth/login", map[string]string{"email": "missing@example.com", "password": "wrong"}, 401)
	}
	c.request("POST", "/api/auth/login", map[string]string{"email": "missing@example.com", "password": "wrong"}, 429)
	// A different IP is needed because the login bucket above is exhausted.
	r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"`+strings.Repeat("x", 150000)+`"}`))
	r.RemoteAddr = "127.0.0.2:1234"
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", a.Config.Origin)
	w := httptest.NewRecorder()
	a.Handler.ServeHTTP(w, r)
	if w.Code != 413 {
		t.Fatalf("body limit: %d %s", w.Code, w.Body.String())
	}
}

func TestAPI404AndSPA(t *testing.T) {
	a := testApp(t)
	c := client{t: t, a: a}
	w := c.request("GET", "/api/does-not-exist", nil, 404)
	if !strings.Contains(w.Header().Get("Content-Type"), "application/problem+json") {
		t.Fatal("API 404 returned HTML")
	}
	c.request("GET", "/assets/missing.js", nil, 404)
	c.request("GET", "/missing.js", nil, 404)
}

func TestConfiguredServerLimits(t *testing.T) {
	a := testApp(t)
	a.Config.HTTP.ReadHeaderTimeout = 3 * time.Second
	a.Config.HTTP.ReadTimeout = 8 * time.Second
	a.Config.HTTP.WriteTimeout = 45 * time.Second
	a.Config.HTTP.IdleTimeout = 90 * time.Second
	a.Config.HTTP.MaxHeaderBytes = 8192
	server := a.httpServer()
	if server.ReadHeaderTimeout != 3*time.Second || server.ReadTimeout != 8*time.Second || server.WriteTimeout != 45*time.Second || server.IdleTimeout != 90*time.Second || server.MaxHeaderBytes != 8192 {
		t.Fatalf("server ignored configuration: %+v", server)
	}
	// Use a global cap smaller than Huma's login cap, proving both layers compose.
	a.Config.HTTP.MaxBodyBytes = 64
	a.Handler, a.API = Router(a.Config, a.DB, a.Auth, a.Log)
	login := a.API.OpenAPI().Paths["/api/auth/login"].Post
	if login.MaxBodyBytes != 64 || login.BodyReadTimeout != 0 {
		t.Fatalf("Huma overrides server limits: %+v", login)
	}
	c := client{t: t, a: a}
	c.request("POST", "/api/auth/login", map[string]string{"email": "a@example.com", "password": strings.Repeat("x", 64)}, 413)
}

func TestConfiguredRequestDeadline(t *testing.T) {
	a := testApp(t)
	if _, err := a.Auth.CreateAdmin(context.Background(), "deadline@example.com", "test password 12345", "Team"); err != nil {
		t.Fatal(err)
	}
	c := client{t: t, a: a}
	c.login("deadline@example.com")
	a.Config.HTTP.RequestTimeout = 20 * time.Millisecond
	a.Handler, a.API = Router(a.Config, a.DB, a.Auth, a.Log)
	release := make(chan struct{})
	defer close(release)
	huma.Register(a.API, huma.Operation{OperationID: "deadline-test", Method: "GET", Path: "/api/wait"}, func(ctx context.Context, _ *struct{}) (*struct{}, error) {
		<-ctx.Done()
		<-release
		return nil, nil
	})
	start := time.Now()
	c.request("GET", "/api/wait", nil, 503)
	if time.Since(start) > time.Second {
		t.Fatal("request did not respect the configured deadline")
	}
}

func TestDevelopmentBootstrapCreatesOnceAndKeepsPassword(t *testing.T) {
	a := testApp(t)
	a.Config.DevAdmin = config.DevAdminConfig{Email: "dev@example.com", Password: "test password 12345", Workspace: "Dev team"}
	ctx := context.Background()
	if err := a.initializeDevAdmin(ctx); err != nil {
		t.Fatal(err)
	}
	c := client{t: t, a: a}
	c.login("dev@example.com")
	if items := c.workspaces(); len(items) != 1 || items[0].Name != "Dev team" || items[0].Role != "owner" {
		t.Fatalf("bootstrap workspace: %+v", items)
	}
	a.Config.DevAdmin.Password = "a different password"
	if err := a.initializeDevAdmin(ctx); err != nil {
		t.Fatal(err)
	}
	c.login("dev@example.com")
	if _, _, err := a.Auth.Login(ctx, "dev@example.com", a.Config.DevAdmin.Password); err == nil {
		t.Fatal("startup replaced the existing password")
	}
	if items := c.workspaces(); len(items) != 1 {
		t.Fatal("restart created duplicate workspaces")
	}
}

func TestDevelopmentBootstrapIsOptInAndNotTriggeredByOpen(t *testing.T) {
	c := config.Defaults(t.TempDir())
	c.DevAdmin = config.DevAdminConfig{Email: "dev@example.com", Password: "test password 12345", Workspace: "Dev team"}
	a, err := Open(context.Background(), c, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	var count int
	if err = a.DB.QueryRow("SELECT count(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatalf("Open created users: %d %v", count, err)
	}
	a.Config.DevAdmin.Email = ""
	if err = a.initializeDevAdmin(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err = a.DB.QueryRow("SELECT count(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatalf("opt-out created users: %d %v", count, err)
	}
}

func TestDevelopmentLoopbackOriginsKeepCSRFAndPortsStrict(t *testing.T) {
	a := testApp(t)
	if _, err := a.Auth.CreateAdmin(context.Background(), "dev@example.com", "test password 12345", "Dev"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		origin string
		status int
	}{
		{"http://127.0.0.1:8080", 200}, {"http://localhost:8080", 200},
		{"http://127.0.0.1:5173", 403}, {"http://localhost.evil.test:8080", 403}, {"", 403},
	} {
		r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"dev@example.com","password":"test password 12345"}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		a.Handler.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("origin %q: got %d want %d", tc.origin, w.Code, tc.status)
		}
	}
	c := client{t: t, a: a}
	c.login("dev@example.com")
	r := httptest.NewRequest("POST", "/api/auth/logout", nil)
	r.Header.Set("Origin", "http://127.0.0.1:8080")
	r.Header.Set("Cookie", c.cookie)
	w := httptest.NewRecorder()
	a.Handler.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal("loopback alias bypassed CSRF")
	}
}
