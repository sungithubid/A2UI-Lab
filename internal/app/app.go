package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"monoseed/internal/modules/auth"
	"monoseed/internal/modules/notes"
	"monoseed/internal/modules/workspace"
	"monoseed/internal/platform/config"
	"monoseed/internal/platform/database"
	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/httpx"
	"monoseed/internal/webui"
)

type App struct {
	Config  config.Config
	DB      *sql.DB
	Auth    *auth.Service
	Handler http.Handler
	API     huma.API
	Log     *slog.Logger
}

func Open(ctx context.Context, c config.Config, log *slog.Logger) (*App, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	db, err := database.Open(ctx, c.DataDir)
	if err != nil {
		return nil, err
	}
	if err = database.Migrate(ctx, db); err != nil {
		db.Close()
		return nil, err
	}
	a := &App{Config: c, DB: db, Log: log}
	a.Auth = auth.NewService(auth.NewRepository(db), c.SessionTTL)
	a.Handler, a.API = Router(c, db, a.Auth, log)
	return a, nil
}

func Router(c config.Config, db *sql.DB, authentication *auth.Service, log *slog.Logger) (http.Handler, huma.API) {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, httpx.Middleware(log, c.HTTP.MaxBodyBytes))
	r.Use(func(next http.Handler) http.Handler {
		return http.TimeoutHandler(next, c.HTTP.RequestTimeout, `{"status":503,"title":"Request timeout"}`)
	})
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), c.HTTP.HealthTimeout)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			httpx.Problem(w, 503, "Database unavailable")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
	})
	cfg := huma.DefaultConfig("Monoseed API", "0.1.0")
	cfg.DocsPath = ""
	cfg.OpenAPIPath = "/api/openapi"
	cfg.SchemasPath = "/api/schemas"
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{"session": {Type: "apiKey", In: "cookie", Name: auth.CookieName}}
	cfg.Security = []map[string][]string{{"session": {}}}
	api := huma.NewGroup(humachi.New(r, cfg))
	api.UseSimpleModifier(func(op *huma.Operation) {
		if op.MaxBodyBytes <= 0 || op.MaxBodyBytes > c.HTTP.MaxBodyBytes {
			op.MaxBodyBytes = c.HTTP.MaxBodyBytes
		}
		// The http.Server ReadTimeout owns the absolute read deadline. Do not let
		// Huma's default per-body deadline override this configured server limit.
		op.BodyReadTimeout = 0
	})
	api.UseMiddleware(auth.Guard(api, authentication, c.TrustedOrigins()...))
	ws := workspace.NewService(workspace.NewRepository(db))
	auth.Register(api, authentication, c.SecureCookies)
	workspace.Register(api, ws)
	notes.Register(api, notes.NewService(notes.NewRepository(db), ws))
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 405, "Method not allowed") })
	r.Handle("/api", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") }))
	r.Handle("/api/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") }))
	r.Handle("/*", webui.Handler())
	return r, api
}

func (a *App) Close() error { return a.DB.Close() }

func (a *App) Serve(ctx context.Context) error {
	if err := a.initializeDevAdmin(ctx); err != nil {
		return err
	}
	server := a.httpServer()
	listener, err := net.Listen("tcp", a.Config.Addr)
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	a.Log.Info("server ready", "addr", a.Config.Addr, "origin", a.Config.Origin, "data_dir", a.Config.DataDir)
	select {
	case err = <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), a.Config.HTTP.ShutdownTimeout)
		defer cancel()
		if err = server.Shutdown(shutdown); err != nil {
			server.Close()
			return err
		}
		return nil
	}
}

// Keep server construction separate so configured deadlines can be verified without opening a listener.
func (a *App) httpServer() *http.Server {
	return &http.Server{Addr: a.Config.Addr, Handler: a.Handler,
		ReadHeaderTimeout: a.Config.HTTP.ReadHeaderTimeout, ReadTimeout: a.Config.HTTP.ReadTimeout,
		WriteTimeout: a.Config.HTTP.WriteTimeout, IdleTimeout: a.Config.HTTP.IdleTimeout,
		MaxHeaderBytes: a.Config.HTTP.MaxHeaderBytes}
}

// Only serve invokes this opt-in bootstrap, so config/migrate/doctor remain free
// of identity side effects. CreateAdmin is atomic and never overwrites accounts.
func (a *App) initializeDevAdmin(ctx context.Context) error {
	if a.Config.Env != "development" || a.Config.DevAdmin.Email == "" {
		return nil
	}
	user, err := a.Auth.CreateAdmin(ctx, a.Config.DevAdmin.Email, a.Config.DevAdmin.Password, a.Config.DevAdmin.Workspace)
	if errors.Is(err, fault.ErrConflict) {
		a.Log.Info("development admin already exists; existing password retained")
		return nil
	}
	if err != nil {
		return fmt.Errorf("initialize development admin: %w", err)
	}
	a.Log.Info("development admin created", "email", user.Email)
	return nil
}
