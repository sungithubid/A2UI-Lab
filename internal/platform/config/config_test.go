package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func cleanEnv(t *testing.T) {
	t.Helper()
	for key := range Defaults(t.TempDir()).Values() {
		t.Setenv(key, "")
	}
	t.Setenv("APP_ENV_FILE", "-")
}

func TestLoadDefaultsAndOverrides(t *testing.T) {
	cleanEnv(t)
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Env != "development" || c.HTTP.RequestTimeout != 30*time.Second || c.HTTP.WriteTimeout != 35*time.Second || c.SessionTTL != 168*time.Hour || !filepath.IsAbs(c.DataDir) {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	overrides := map[string]string{
		"APP_ENV": "test", "APP_ADDR": "127.0.0.1:9090", "APP_DATA_DIR": t.TempDir(), "APP_ORIGIN": "http://localhost:9090",
		"APP_COOKIE_SECURE": "true", "APP_SESSION_TTL": "12h", "APP_LOG_LEVEL": "debug", "APP_LOG_FORMAT": "text",
		"APP_HTTP_READ_HEADER_TIMEOUT": "500ms", "APP_HTTP_READ_TIMEOUT": "7s", "APP_HTTP_REQUEST_TIMEOUT": "20s",
		"APP_HTTP_WRITE_TIMEOUT": "25s", "APP_HTTP_IDLE_TIMEOUT": "2m", "APP_HTTP_SHUTDOWN_TIMEOUT": "3s",
		"APP_HTTP_HEALTH_TIMEOUT": "1s", "APP_HTTP_MAX_HEADER_BYTES": "8192", "APP_HTTP_MAX_BODY_BYTES": "4096",
	}
	for key, value := range overrides {
		t.Setenv(key, value)
	}
	c, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range overrides {
		// Durations may be normalized, e.g. 12h -> 12h0m0s.
		got := c.Values()[key]
		if strings.Contains(key, "TIMEOUT") || key == "APP_SESSION_TTL" {
			a, _ := time.ParseDuration(got)
			b, _ := time.ParseDuration(value)
			if a != b {
				t.Fatalf("%s: got %s want %s", key, got, value)
			}
		} else if got != value {
			t.Fatalf("%s: got %s want %s", key, got, value)
		}
	}
}

func TestEnvFilePrecedenceAndErrors(t *testing.T) {
	cleanEnv(t)
	dir := t.TempDir()
	t.Chdir(dir)
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("# local config\nAPP_ADDR=127.0.0.1:9191\nAPP_LOG_FORMAT=\"text\"\nAPP_HTTP_IDLE_TIMEOUT=90s # trailing comment\nAPP_ENV_FILE=missing.env\n"), 0600); err != nil {
		t.Fatal(err)
	}
	// Remove variables to let the file supply these settings.
	for _, key := range []string{"APP_ENV_FILE", "APP_ADDR", "APP_LOG_FORMAT", "APP_HTTP_IDLE_TIMEOUT"} {
		if err := os.Unsetenv(key); err != nil {
			t.Fatal(err)
		}
	}
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Addr != "127.0.0.1:9191" || c.LogFormat != "text" || c.HTTP.IdleTimeout != 90*time.Second || c.EnvFile != path {
		t.Fatalf("file not loaded: %+v", c)
	}
	if _, exists := os.LookupEnv("APP_ADDR"); exists {
		t.Fatal("Load polluted the process environment")
	}
	t.Setenv("APP_ADDR", "127.0.0.1:9292")
	c, err = Load()
	if err != nil || c.Addr != "127.0.0.1:9292" {
		t.Fatalf("process did not override file: %+v %v", c, err)
	}
	t.Setenv("APP_ADDR", "")
	c, err = Load()
	if err != nil || c.Addr != "127.0.0.1:8080" {
		t.Fatalf("empty process variable should select default: %+v %v", c, err)
	}
	t.Setenv("APP_ENV_FILE", "-")
	c, err = Load()
	if err != nil || c.LogFormat != "json" {
		t.Fatalf("file not disabled: %+v %v", c, err)
	}
	t.Setenv("APP_ENV_FILE", filepath.Join(dir, "missing"))
	if _, err = Load(); err == nil {
		t.Fatal("missing explicit file accepted")
	}
	t.Setenv("APP_ENV_FILE", "")
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(); err != nil {
		t.Fatalf("missing optional file: %v", err)
	}
	if err = os.WriteFile(path, []byte("APP_ENV=\"unterminated"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(); err == nil {
		t.Fatal("malformed file ignored")
	}
}

func TestInvalidSettingsFailWithVariableName(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"APP_ENV", "staging"}, {"APP_LOG_LEVEL", "verbose"}, {"APP_LOG_FORMAT", "xml"},
		{"APP_DATA_DIR", "relative"}, {"APP_ADDR", "localhost:not-a-port"}, {"APP_ADDR", "localhost:70000"},
		{"APP_COOKIE_SECURE", "yes"}, {"APP_SESSION_TTL", "7d"}, {"APP_SESSION_TTL", "0s"},
		{"APP_HTTP_REQUEST_TIMEOUT", "forever"}, {"APP_HTTP_READ_TIMEOUT", "-1s"}, {"APP_HTTP_IDLE_TIMEOUT", "0s"},
		{"APP_HTTP_READ_TIMEOUT", "1s"}, {"APP_HTTP_WRITE_TIMEOUT", "30s"}, {"APP_HTTP_HEALTH_TIMEOUT", "31s"},
		{"APP_HTTP_MAX_HEADER_BYTES", "1MB"}, {"APP_HTTP_MAX_BODY_BYTES", "-1"},
		{"APP_HTTP_MAX_HEADER_BYTES", "0"}, {"APP_HTTP_MAX_BODY_BYTES", "67108865"},
	} {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			cleanEnv(t)
			t.Setenv(tc.key, tc.value)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), tc.key) {
				t.Fatalf("expected %s validation error, got %v", tc.key, err)
			}
		})
	}
}

func TestProductionAndOriginValidation(t *testing.T) {
	base := Defaults(t.TempDir())
	for _, change := range []func(*Config){
		func(c *Config) { c.Env = "production" }, func(c *Config) { c.Origin = "https://example.com" },
		func(c *Config) { c.Origin = "https://example.com/" }, func(c *Config) { c.Origin = "http://example.com" },
		func(c *Config) { c.Origin = "http://localhost:8080?" },
	} {
		c := base
		change(&c)
		if c.Validate() == nil {
			t.Fatalf("accepted invalid config: %+v", c)
		}
	}
	base.Env = "production"
	base.Origin = "https://example.com"
	base.SecureCookies = true
	if err := base.Validate(); err != nil {
		t.Fatalf("valid production settings: %v", err)
	}
}

func TestExampleCoversEverySetting(t *testing.T) {
	cleanEnv(t)
	data, err := os.ReadFile("../../../.env.example")
	if err != nil {
		t.Fatal(err)
	}
	for key := range Defaults(t.TempDir()).Values() {
		if !strings.Contains(string(data), key+"=") {
			t.Errorf(".env.example is missing %s", key)
		}
	}
	// The example should also be directly loadable, not just documentation.
	for key := range Defaults(t.TempDir()).Values() {
		if err = os.Unsetenv(key); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("APP_ENV_FILE", "../../../.env.example")
	if _, err = Load(); err != nil {
		t.Fatalf("example is invalid: %v", err)
	}
}

func TestDevelopmentAdminSettingsAndRedaction(t *testing.T) {
	cleanEnv(t)
	t.Setenv("APP_DEV_ADMIN_EMAIL", "dev@example.test")
	if _, err := Load(); err == nil {
		t.Fatal("partial bootstrap settings accepted")
	}
	t.Setenv("APP_DEV_ADMIN_PASSWORD", "development password")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.DevAdmin.Password != "development password" || c.Values()["APP_DEV_ADMIN_PASSWORD"] != "[redacted]" {
		t.Fatal("password loading or redaction failed")
	}
	for _, env := range []string{"test", "production"} {
		t.Setenv("APP_ENV", env)
		if _, err = Load(); err == nil || !strings.Contains(err.Error(), "APP_DEV_ADMIN") {
			t.Fatalf("bootstrap accepted outside development: %v", err)
		}
	}
	t.Setenv("APP_ENV", "development")
	t.Setenv("APP_DEV_ADMIN_PASSWORD", "short")
	if _, err = Load(); err == nil || strings.Contains(err.Error(), "short") {
		t.Fatalf("invalid password accepted or disclosed: %v", err)
	}
}

func TestTrustedDevelopmentOrigins(t *testing.T) {
	c := Defaults(t.TempDir())
	c.Origin = "http://localhost:5173"
	got := c.TrustedOrigins()
	if len(got) != 2 || got[0] != c.Origin || got[1] != "http://127.0.0.1:5173" {
		t.Fatalf("unexpected aliases: %v", got)
	}
	for _, env := range []string{"production", "test"} {
		c.Env = env
		if origins := c.TrustedOrigins(); len(origins) != 1 || origins[0] != c.Origin {
			t.Fatalf("aliases enabled outside development: %v", origins)
		}
	}
	c.Env = "development"
	c.Origin = "https://example.com"
	if len(c.TrustedOrigins()) != 1 {
		t.Fatal("remote origins were broadened")
	}
}
