package config

import (
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type HTTPConfig struct {
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	RequestTimeout    time.Duration
	ShutdownTimeout   time.Duration
	HealthTimeout     time.Duration
	MaxHeaderBytes    int
	MaxBodyBytes      int64
}

type DevAdminConfig struct {
	Email     string
	Password  string
	Workspace string
}

type Config struct {
	Env           string
	EnvFile       string
	Addr          string
	DataDir       string
	Origin        string
	SecureCookies bool
	SessionTTL    time.Duration
	LogLevel      slog.Level
	LogFormat     string
	DevAdmin      DevAdminConfig
	HTTP          HTTPConfig
}

// Defaults is also the starting point for explicit configurations in tests.
// dataDir must be absolute; Load resolves the OS-specific default separately.
func Defaults(dataDir string) Config {
	return Config{
		Env: "development", EnvFile: "-", Addr: "127.0.0.1:8080", DataDir: dataDir,
		Origin: "http://localhost:8080", SessionTTL: 7 * 24 * time.Hour, LogLevel: slog.LevelInfo, LogFormat: "json",
		DevAdmin: DevAdminConfig{Workspace: "Development"},
		HTTP: HTTPConfig{
			ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 35 * time.Second,
			IdleTimeout: 60 * time.Second, RequestTimeout: 30 * time.Second, ShutdownTimeout: 10 * time.Second,
			HealthTimeout: 2 * time.Second, MaxHeaderBytes: 1 << 20, MaxBodyBytes: 128 * 1024,
		},
	}
}

func Load() (Config, error) {
	file := os.Getenv("APP_ENV_FILE")
	explicit := file != ""
	if !explicit {
		file = ".env"
	}
	values := map[string]string{}
	loadedFile := "-"
	if file != "-" {
		var err error
		values, err = godotenv.Read(file)
		if err != nil && (explicit || !os.IsNotExist(err)) {
			return Config{}, fmt.Errorf("load env file %q: %w", file, err)
		}
		if err == nil {
			loadedFile, err = filepath.Abs(file)
			if err != nil {
				return Config{}, err
			}
		}
	}
	// Reading into a map avoids modifying global process environment. An explicitly
	// empty process value wins over the file and selects the built-in default.
	get := func(key, fallback string) string {
		value, ok := os.LookupEnv(key)
		if !ok {
			value = values[key]
		}
		if value == "" {
			return fallback
		}
		return value
	}
	dataDir := get("APP_DATA_DIR", "")
	if dataDir == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return Config{}, err
		}
		dataDir = filepath.Join(base, "monoseed")
	}
	c := Defaults(dataDir)
	c.EnvFile = loadedFile
	c.Env = get("APP_ENV", c.Env)
	c.Addr = get("APP_ADDR", c.Addr)
	c.Origin = get("APP_ORIGIN", c.Origin)
	c.LogFormat = get("APP_LOG_FORMAT", c.LogFormat)
	c.DevAdmin.Email = get("APP_DEV_ADMIN_EMAIL", "")
	c.DevAdmin.Password = get("APP_DEV_ADMIN_PASSWORD", "")
	c.DevAdmin.Workspace = get("APP_DEV_ADMIN_WORKSPACE", c.DevAdmin.Workspace)
	switch get("APP_LOG_LEVEL", "info") {
	case "debug":
		c.LogLevel = slog.LevelDebug
	case "info":
		c.LogLevel = slog.LevelInfo
	case "warn":
		c.LogLevel = slog.LevelWarn
	case "error":
		c.LogLevel = slog.LevelError
	default:
		return c, fmt.Errorf("APP_LOG_LEVEL must be debug, info, warn or error")
	}
	var err error
	if c.SecureCookies, err = strconv.ParseBool(get("APP_COOKIE_SECURE", "false")); err != nil {
		return c, fmt.Errorf("APP_COOKIE_SECURE: %w", err)
	}
	for _, setting := range []struct {
		key    string
		target *time.Duration
	}{
		{"APP_SESSION_TTL", &c.SessionTTL},
		{"APP_HTTP_READ_HEADER_TIMEOUT", &c.HTTP.ReadHeaderTimeout},
		{"APP_HTTP_READ_TIMEOUT", &c.HTTP.ReadTimeout},
		{"APP_HTTP_WRITE_TIMEOUT", &c.HTTP.WriteTimeout},
		{"APP_HTTP_IDLE_TIMEOUT", &c.HTTP.IdleTimeout},
		{"APP_HTTP_REQUEST_TIMEOUT", &c.HTTP.RequestTimeout},
		{"APP_HTTP_SHUTDOWN_TIMEOUT", &c.HTTP.ShutdownTimeout},
		{"APP_HTTP_HEALTH_TIMEOUT", &c.HTTP.HealthTimeout},
	} {
		value, err := time.ParseDuration(get(setting.key, setting.target.String()))
		if err != nil {
			return c, fmt.Errorf("%s: use a duration such as 500ms, 15s or 168h: %w", setting.key, err)
		}
		*setting.target = value
	}
	if c.HTTP.MaxHeaderBytes, err = strconv.Atoi(get("APP_HTTP_MAX_HEADER_BYTES", strconv.Itoa(c.HTTP.MaxHeaderBytes))); err != nil {
		return c, fmt.Errorf("APP_HTTP_MAX_HEADER_BYTES: %w", err)
	}
	if c.HTTP.MaxBodyBytes, err = strconv.ParseInt(get("APP_HTTP_MAX_BODY_BYTES", strconv.FormatInt(c.HTTP.MaxBodyBytes, 10)), 10, 64); err != nil {
		return c, fmt.Errorf("APP_HTTP_MAX_BODY_BYTES: %w", err)
	}
	return c, c.Validate()
}

func (c Config) Validate() error {
	if c.Env != "development" && c.Env != "test" && c.Env != "production" {
		return fmt.Errorf("APP_ENV must be development, test or production")
	}
	if c.LogFormat != "json" && c.LogFormat != "text" {
		return fmt.Errorf("APP_LOG_FORMAT must be json or text")
	}
	if c.LogLevel != slog.LevelDebug && c.LogLevel != slog.LevelInfo && c.LogLevel != slog.LevelWarn && c.LogLevel != slog.LevelError {
		return fmt.Errorf("APP_LOG_LEVEL must be debug, info, warn or error")
	}
	if c.DevAdmin.Email != "" || c.DevAdmin.Password != "" {
		if c.Env != "development" {
			return fmt.Errorf("APP_DEV_ADMIN_EMAIL and APP_DEV_ADMIN_PASSWORD are allowed only with APP_ENV=development")
		}
		if c.DevAdmin.Email == "" || c.DevAdmin.Password == "" {
			return fmt.Errorf("APP_DEV_ADMIN_EMAIL and APP_DEV_ADMIN_PASSWORD must be set together")
		}
		if len(c.DevAdmin.Password) < 12 || len(c.DevAdmin.Password) > 72 {
			return fmt.Errorf("APP_DEV_ADMIN_PASSWORD must be 12–72 bytes")
		}
	}
	if !filepath.IsAbs(c.DataDir) {
		return fmt.Errorf("APP_DATA_DIR must be an absolute path")
	}
	_, port, err := net.SplitHostPort(c.Addr)
	if err != nil {
		return fmt.Errorf("APP_ADDR: %w", err)
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 0 || n > 65535 {
		return fmt.Errorf("APP_ADDR must contain a numeric port between 0 and 65535")
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.User != nil {
		return fmt.Errorf("APP_ORIGIN must be an origin, e.g. https://app.example.com (no trailing slash)")
	}
	if u.Scheme == "https" && !c.SecureCookies {
		return fmt.Errorf("HTTPS requires APP_COOKIE_SECURE=true")
	}
	if c.Env == "production" && u.Scheme != "https" {
		return fmt.Errorf("APP_ENV=production requires an HTTPS APP_ORIGIN and APP_COOKIE_SECURE=true")
	}
	if u.Scheme == "http" && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
		return fmt.Errorf("non-loopback APP_ORIGIN requires HTTPS")
	}
	for _, setting := range []struct {
		key   string
		value time.Duration
	}{
		{"APP_SESSION_TTL", c.SessionTTL}, {"APP_HTTP_READ_HEADER_TIMEOUT", c.HTTP.ReadHeaderTimeout},
		{"APP_HTTP_READ_TIMEOUT", c.HTTP.ReadTimeout}, {"APP_HTTP_WRITE_TIMEOUT", c.HTTP.WriteTimeout},
		{"APP_HTTP_IDLE_TIMEOUT", c.HTTP.IdleTimeout}, {"APP_HTTP_REQUEST_TIMEOUT", c.HTTP.RequestTimeout},
		{"APP_HTTP_SHUTDOWN_TIMEOUT", c.HTTP.ShutdownTimeout}, {"APP_HTTP_HEALTH_TIMEOUT", c.HTTP.HealthTimeout},
	} {
		if setting.value <= 0 {
			return fmt.Errorf("%s must be positive (timeouts cannot be disabled)", setting.key)
		}
	}
	if c.SessionTTL < time.Second {
		return fmt.Errorf("APP_SESSION_TTL must be at least 1s")
	}
	if c.HTTP.ReadTimeout < c.HTTP.ReadHeaderTimeout {
		return fmt.Errorf("APP_HTTP_READ_TIMEOUT must be >= APP_HTTP_READ_HEADER_TIMEOUT")
	}
	if c.HTTP.WriteTimeout <= c.HTTP.RequestTimeout {
		return fmt.Errorf("APP_HTTP_WRITE_TIMEOUT must be > APP_HTTP_REQUEST_TIMEOUT so timeout responses can be sent")
	}
	if c.HTTP.HealthTimeout > c.HTTP.RequestTimeout {
		return fmt.Errorf("APP_HTTP_HEALTH_TIMEOUT must be <= APP_HTTP_REQUEST_TIMEOUT")
	}
	if c.HTTP.MaxHeaderBytes < 1 || c.HTTP.MaxHeaderBytes > 16<<20 {
		return fmt.Errorf("APP_HTTP_MAX_HEADER_BYTES must be between 1 and 16777216")
	}
	if c.HTTP.MaxBodyBytes < 1 || c.HTTP.MaxBodyBytes > 64<<20 {
		return fmt.Errorf("APP_HTTP_MAX_BODY_BYTES must be between 1 and 67108864")
	}
	return nil
}

// Values contains only known non-secret settings, with durations in human-readable
// units. Secrets must be redacted explicitly; never dump the process environment.
func (c Config) Values() map[string]string {
	password := ""
	if c.DevAdmin.Password != "" {
		password = "[redacted]"
	}
	return map[string]string{
		"APP_ENV": c.Env, "APP_ENV_FILE": c.EnvFile, "APP_ADDR": c.Addr, "APP_DATA_DIR": c.DataDir, "APP_ORIGIN": c.Origin,
		"APP_DEV_ADMIN_EMAIL": c.DevAdmin.Email, "APP_DEV_ADMIN_PASSWORD": password, "APP_DEV_ADMIN_WORKSPACE": c.DevAdmin.Workspace,
		"APP_COOKIE_SECURE": strconv.FormatBool(c.SecureCookies), "APP_SESSION_TTL": c.SessionTTL.String(),
		"APP_LOG_LEVEL": map[slog.Level]string{slog.LevelDebug: "debug", slog.LevelInfo: "info", slog.LevelWarn: "warn", slog.LevelError: "error"}[c.LogLevel], "APP_LOG_FORMAT": c.LogFormat,
		"APP_HTTP_READ_HEADER_TIMEOUT": c.HTTP.ReadHeaderTimeout.String(), "APP_HTTP_READ_TIMEOUT": c.HTTP.ReadTimeout.String(),
		"APP_HTTP_WRITE_TIMEOUT": c.HTTP.WriteTimeout.String(), "APP_HTTP_IDLE_TIMEOUT": c.HTTP.IdleTimeout.String(),
		"APP_HTTP_REQUEST_TIMEOUT": c.HTTP.RequestTimeout.String(), "APP_HTTP_SHUTDOWN_TIMEOUT": c.HTTP.ShutdownTimeout.String(),
		"APP_HTTP_HEALTH_TIMEOUT": c.HTTP.HealthTimeout.String(), "APP_HTTP_MAX_HEADER_BYTES": strconv.Itoa(c.HTTP.MaxHeaderBytes),
		"APP_HTTP_MAX_BODY_BYTES": strconv.FormatInt(c.HTTP.MaxBodyBytes, 10),
	}
}

// TrustedOrigins keeps production/test strict. Local HTTP development accepts
// localhost and 127.0.0.1 on the same configured port, matching Vite's two URLs.
func (c Config) TrustedOrigins() []string {
	origins := []string{c.Origin}
	u, err := url.Parse(c.Origin)
	if err != nil || c.Env != "development" || u.Scheme != "http" {
		return origins
	}
	if u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" {
		return origins
	}
	for _, host := range []string{"localhost", "127.0.0.1"} {
		if u.Port() != "" {
			host = net.JoinHostPort(host, u.Port())
		}
		alias := "http://" + host
		if alias != c.Origin {
			origins = append(origins, alias)
		}
	}
	return origins
}
