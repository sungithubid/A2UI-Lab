package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"monoseed/internal/platform/database"
	"monoseed/internal/platform/fault"
	"monoseed/internal/platform/security"
)

func TestAuthenticationLifecycle(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	service := NewService(repo, time.Hour)
	u, err := service.CreateAdmin(ctx, "Owner@Example.com", "correct horse battery", "Team")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CreateAdmin(ctx, u.Email, "correct horse battery", "Duplicate"); !errors.Is(err, fault.ErrConflict) {
		t.Fatal("duplicate user accepted")
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM workspaces").Scan(&count); err != nil || count != 1 {
		t.Fatalf("transaction leak: %d %v", count, err)
	}
	if _, _, err = service.Login(ctx, u.Email, "wrong password"); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatalf("wrong password: %v", err)
	}
	if _, _, err = service.Login(ctx, "missing@example.com", "wrong password"); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatalf("unknown user: %v", err)
	}
	session, token, err := service.Login(ctx, u.Email, "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if session.TokenHash == token || session.TokenHash != security.Hash(token) {
		t.Fatal("session token not hashed")
	}
	restored, err := service.Authenticate(ctx, token)
	if err != nil || restored.User.ID != u.ID {
		t.Fatalf("session: %+v %v", restored, err)
	}
	if err = service.Logout(ctx, session); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Authenticate(ctx, token); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatal("logged out token accepted")
	}
	_, token, err = service.Login(ctx, u.Email, "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("UPDATE sessions SET expires_at=0"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Authenticate(ctx, token); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatal("expired session accepted")
	}
	if _, err = service.CreateAdmin(ctx, "bad", "short", "Team"); !errors.Is(err, fault.ErrInvalid) {
		t.Fatal("invalid admin accepted")
	}
}

func TestLimiter(t *testing.T) {
	l := NewLimiter()
	for i := 0; i < 10; i++ {
		if !l.Allow("127.0.0.1:123") {
			t.Fatal("limited too early")
		}
	}
	if l.Allow("127.0.0.1:456") {
		t.Fatal("source port bypassed limit")
	}
	if !l.Allow("127.0.0.2:123") {
		t.Fatal("unrelated IP limited")
	}
}
