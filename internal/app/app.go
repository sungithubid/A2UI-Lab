package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/sungithubid/A2UI-Lab/internal/agent/mock"
	"github.com/sungithubid/A2UI-Lab/internal/modules/lab"
	"github.com/sungithubid/A2UI-Lab/internal/platform/config"
	"github.com/sungithubid/A2UI-Lab/internal/platform/database"
	"github.com/sungithubid/A2UI-Lab/internal/platform/httpx"
	"github.com/sungithubid/A2UI-Lab/internal/webui"
)

type App struct {
	Config  config.Config
	DB      *sql.DB
	Lab     *lab.Service
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
	repo := lab.NewRepository(db)
	a.Lab = lab.NewService(repo, mock.Agent{Delay: 250 * time.Millisecond}, log)
	a.Handler, a.API = Router(c, db, log, a.Lab)
	return a, nil
}

func Router(c config.Config, db *sql.DB, log *slog.Logger, services ...*lab.Service) (http.Handler, huma.API) {
	s := (*lab.Service)(nil)
	if len(services) > 0 {
		s = services[0]
	}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, httpx.Middleware(log, c.HTTP.MaxBodyBytes))
	r.Use(func(next http.Handler) http.Handler {
		timed := http.TimeoutHandler(next, c.HTTP.RequestTimeout, `{"status":503,"title":"Request timeout"}`)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/runs/") && strings.HasSuffix(r.URL.Path, "/stream") {
				next.ServeHTTP(w, r)
			} else {
				timed.ServeHTTP(w, r)
			}
		})
	})
	// Local unauthenticated API: reject foreign browser origins and DNS rebinding.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			trusted := c.TrustedOrigins()
			allowedHost := false
			for _, o := range trusted {
				u, _ := url.Parse(o)
				if r.Host == u.Host {
					allowedHost = true
				}
			}
			host, _, _ := net.SplitHostPort(r.Host)
			listenHost, _, _ := net.SplitHostPort(c.Addr)
			if host == listenHost && r.Host == c.Addr {
				allowedHost = true
			}
			if !allowedHost || (origin != "" && !slices.Contains(trusted, origin)) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				httpx.Problem(w, 403, "Untrusted host or origin")
				return
			}
			if r.Method != "GET" && r.Method != "HEAD" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				httpx.Problem(w, 415, "application/json required")
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	r.Get("/api/runs/{id}/stream", lab.Stream(s))
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
	cfg := huma.DefaultConfig("A2UI Lab API", "0.1.0")
	cfg.DocsPath = ""
	cfg.OpenAPIPath = "/api/openapi"
	cfg.SchemasPath = "/api/schemas"
	api := huma.NewGroup(humachi.New(r, cfg))
	api.UseSimpleModifier(func(op *huma.Operation) {
		if op.MaxBodyBytes <= 0 || op.MaxBodyBytes > c.HTTP.MaxBodyBytes {
			op.MaxBodyBytes = c.HTTP.MaxBodyBytes
		}
		// The http.Server ReadTimeout owns the absolute read deadline. Do not let
		// Huma's default per-body deadline override this configured server limit.
		op.BodyReadTimeout = 0
	})
	lab.Register(api, s)
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 405, "Method not allowed") })
	r.Handle("/api", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") }))
	r.Handle("/api/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { httpx.Problem(w, 404, "Route not found") }))
	r.Handle("/*", webui.Handler())
	return r, api
}

func (a *App) Close() error { a.Lab.Close(); return a.DB.Close() }

func (a *App) Serve(ctx context.Context) error {
	server := a.httpServer()
	listener, err := net.Listen("tcp", a.Config.Addr)
	if err != nil {
		return err
	}
	if err = lab.NewRepository(a.DB).Recover(ctx); err != nil {
		listener.Close()
		return err
	}
	server.BaseContext = func(net.Listener) context.Context { return ctx }
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
		a.Lab.Close()
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
