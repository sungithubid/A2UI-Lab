package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// Keep .gitkeep so Go tools also work before the first frontend build.
//
//go:embed all:dist
var assets embed.FS

func Handler() http.Handler {
	sub, _ := fs.Sub(assets, "dist")
	return serve(sub)
}

func serve(sub fs.FS) http.Handler {
	files := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "method not allowed", 405)
			return
		}
		clean := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if clean == "api" || strings.HasPrefix(clean, "api/") || strings.HasPrefix(clean, ".") {
			http.NotFound(w, r)
			return
		}
		if strings.HasPrefix(clean, "assets/") {
			if info, err := fs.Stat(sub, clean); err != nil || info.IsDir() {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			files.ServeHTTP(w, r)
			return
		}
		if clean != "." && clean != "index.html" {
			if info, err := fs.Stat(sub, clean); err == nil && !info.IsDir() {
				w.Header().Set("Cache-Control", "no-cache")
				files.ServeHTTP(w, r)
				return
			}
		}
		// Missing file URLs must not receive HTML.
		if path.Ext(clean) != "" && clean != "index.html" {
			http.NotFound(w, r)
			return
		}
		index, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.Error(w, "Frontend not built: run make build", 503)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.Method == "GET" {
			w.Write(index)
		}
	})
}
