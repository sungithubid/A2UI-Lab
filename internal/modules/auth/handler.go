package auth

import (
	"context"
	"crypto/subtle"
	"net"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"monoseed/internal/platform/httpx"
)

const CookieName = "monoseed_session"

type sessionKey struct{}

func Current(ctx context.Context) Session { s, _ := ctx.Value(sessionKey{}).(Session); return s }

type bucket struct {
	count int
	until time.Time
}
type Limiter struct {
	mu      sync.Mutex
	entries map[string]bucket
}

func NewLimiter() *Limiter { return &Limiter{entries: map[string]bucket{}} }

func (l *Limiter) Allow(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, b := range l.entries {
		if now.After(b.until) {
			delete(l.entries, k)
		}
	}
	b, ok := l.entries[host]
	if !ok {
		if len(l.entries) >= 4096 {
			return false
		}
		b = bucket{until: now.Add(time.Minute)}
	}
	if b.count >= 10 {
		return false
	}
	b.count++
	l.entries[host] = b
	return true
}

// Guard authenticates all API operations except explicitly public ones. It does not trust forwarded IP headers.
func Guard(api huma.API, s *Service, origins ...string) func(huma.Context, func(huma.Context)) {
	limiter := NewLimiter()
	return func(c huma.Context, next func(huma.Context)) {
		c.SetHeader("Cache-Control", "no-store")
		unsafe := c.Method() != "GET" && c.Method() != "HEAD" && c.Method() != "OPTIONS"
		if unsafe && !slices.Contains(origins, c.Header("Origin")) {
			huma.WriteErr(api, c, 403, "Untrusted request origin")
			return
		}
		if c.Operation().OperationID == "login" {
			if !limiter.Allow(c.RemoteAddr()) {
				c.SetHeader("Retry-After", "60")
				huma.WriteErr(api, c, 429, "Too many login attempts")
				return
			}
			next(c)
			return
		}
		cookie, err := huma.ReadCookie(c, CookieName)
		if err != nil {
			huma.WriteErr(api, c, 401, "Authentication required")
			return
		}
		session, err := s.Authenticate(c.Context(), cookie.Value)
		if err != nil {
			e := httpx.Error(err).(huma.StatusError)
			huma.WriteErr(api, c, e.GetStatus(), e.Error())
			return
		}
		if unsafe && subtle.ConstantTimeCompare([]byte(session.CSRF), []byte(c.Header("X-CSRF-Token"))) != 1 {
			huma.WriteErr(api, c, 403, "Invalid CSRF token")
			return
		}
		next(huma.WithContext(c, context.WithValue(c.Context(), sessionKey{}, session)))
	}
}

type MeBody struct {
	User      User   `json:"user"`
	CSRFToken string `json:"csrf_token"`
}
type MeOutput struct{ Body MeBody }
type LoginInput struct {
	Body struct {
		Email    string `json:"email" maxLength:"254"`
		Password string `json:"password" minLength:"1" maxLength:"72"`
	}
}
type LoginOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      MeBody
}
type LogoutOutput struct {
	SetCookie string `header:"Set-Cookie"`
}

func Register(api huma.API, s *Service, secure bool) {
	huma.Register(api, huma.Operation{OperationID: "login", Method: "POST", Path: "/api/auth/login", Summary: "Sign in", Security: []map[string][]string{}, MaxBodyBytes: 4096}, func(ctx context.Context, in *LoginInput) (*LoginOutput, error) {
		session, token, err := s.Login(ctx, in.Body.Email, in.Body.Password)
		if err != nil {
			return nil, httpx.Error(err)
		}
		c := http.Cookie{Name: CookieName, Value: token, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, Expires: session.ExpiresAt, MaxAge: int(time.Until(session.ExpiresAt).Seconds())}
		return &LoginOutput{SetCookie: c.String(), Body: MeBody{User: session.User, CSRFToken: session.CSRF}}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "me", Method: "GET", Path: "/api/auth/me", Summary: "Current session"}, func(ctx context.Context, _ *struct{}) (*MeOutput, error) {
		s := Current(ctx)
		return &MeOutput{Body: MeBody{User: s.User, CSRFToken: s.CSRF}}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "logout", Method: "POST", Path: "/api/auth/logout", Summary: "Sign out", DefaultStatus: 204}, func(ctx context.Context, _ *struct{}) (*LogoutOutput, error) {
		if err := s.Logout(ctx, Current(ctx)); err != nil {
			return nil, httpx.Error(err)
		}
		c := http.Cookie{Name: CookieName, Path: "/", Value: "", HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(1, 0)}
		return &LogoutOutput{SetCookie: c.String()}, nil
	})
}
