package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"monoseed/internal/platform/config"
)

func TestConfigShowIsReadableAndDoesNotOpenDatabase(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "not-created")
	for key := range config.Defaults(dir).Values() {
		t.Setenv(key, "")
	}
	t.Setenv("APP_ENV_FILE", "-")
	t.Setenv("APP_DATA_DIR", dir)
	t.Setenv("APP_HTTP_REQUEST_TIMEOUT", "10s")
	t.Setenv("UNRELATED_SECRET", "never-print-this")
	t.Setenv("APP_DEV_ADMIN_EMAIL", "cli@example.test")
	t.Setenv("APP_DEV_ADMIN_PASSWORD", "never-print-this")
	output, err := os.CreateTemp(t.TempDir(), "config-output")
	if err != nil {
		t.Fatal(err)
	}
	defer output.Close()
	original := os.Stdout
	os.Stdout = output
	defer func() { os.Stdout = original }()
	if err = run([]string{"config", "show"}, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	if _, err = output.Seek(0, 0); err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(output)
	if err != nil {
		t.Fatal(err)
	}
	var values map[string]string
	if err = json.Unmarshal(data, &values); err != nil {
		t.Fatal(err)
	}
	if values["APP_HTTP_REQUEST_TIMEOUT"] != "10s" || values["APP_DATA_DIR"] != dir || values["APP_DEV_ADMIN_PASSWORD"] != "[redacted]" || strings.Contains(string(data), "never-print-this") {
		t.Fatalf("unexpected config output: %s", data)
	}
	if _, err = os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("config show touched the data directory: %v", err)
	}
}
