package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
)

func Problem(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"status": status, "title": http.StatusText(status), "detail": message})
}

func Middleware(log *slog.Logger, maxBodyBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			id := middleware.GetReqID(r.Context())
			// TimeoutHandler writes its fallback through this writer; successful handlers set their own media type.
			w.Header().Set("Content-Type", "application/problem+json")
			w.Header().Set("X-Request-ID", id)
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "same-origin")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				if recovered := recover(); recovered != nil {
					log.Error("panic recovered", "request_id", id, "panic", recovered)
					Problem(ww, 500, "Internal server error")
				}
				log.Info("http request", "request_id", id, "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "duration_ms", time.Since(start).Milliseconds())
			}()
			next.ServeHTTP(ww, r)
		})
	}
}
