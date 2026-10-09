package auth

import (
	"context"
	"errors"
	"fmt"
	"monoseed/internal/platform/database"
	"monoseed/internal/platform/fault"
	"testing"
	"time"
)

func TestRepositoryTransactionsAndSessionBound(t *testing.T) {
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
	// A later statement fails, so the already inserted identity must also roll back.
	if _, err = repo.CreateAdmin(ctx, "rollback@example.test", "hash", ""); err == nil {
		t.Fatal("invalid workspace accepted")
	}
	if _, _, err = repo.Credentials(ctx, "rollback@example.test"); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatalf("identity transaction leaked: %v", err)
	}
	a, err := repo.CreateAdmin(ctx, "a@example.test", "hash-a", "A")
	if err != nil {
		t.Fatal(err)
	}
	b, err := repo.CreateAdmin(ctx, "b@example.test", "hash-b", "B")
	if err != nil {
		t.Fatal(err)
	}
	got, hash, err := repo.Credentials(ctx, "A@example.test")
	if err != nil || got != a || hash != "hash-a" {
		t.Fatalf("credential mapping: %+v %s %v", got, hash, err)
	}
	expiry := time.Now().Add(time.Hour).Truncate(time.Second)
	other := Session{User: b, CSRF: "csrf-b", TokenHash: "hash-b", ExpiresAt: expiry}
	if err = repo.SaveSession(ctx, other); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 12; i++ {
		s := Session{User: a, CSRF: fmt.Sprintf("csrf-%d", i), TokenHash: fmt.Sprintf("hash-%d", i), ExpiresAt: expiry.Add(time.Duration(i) * time.Second)}
		if err = repo.SaveSession(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	restored, err := repo.Session(ctx, "hash-11")
	if err != nil || restored.User != a || restored.CSRF != "csrf-11" || restored.TokenHash != "hash-11" || !restored.ExpiresAt.Equal(expiry.Add(11*time.Second)) {
		t.Fatalf("session mapping: %+v %v", restored, err)
	}
	if _, err = repo.Session(ctx, "hash-0"); !errors.Is(err, fault.ErrUnauthorized) {
		t.Fatalf("oldest session retained: %v", err)
	}
	if _, err = repo.Session(ctx, other.TokenHash); err != nil {
		t.Fatalf("another user's session pruned: %v", err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM sessions WHERE user_id=?", a.ID).Scan(&count); err != nil || count != 10 {
		t.Fatalf("session bound: %d %v", count, err)
	}
	// Expiry pruning and trimming must roll back if the final insert fails.
	if _, err = db.Exec("INSERT INTO sessions VALUES('expired',?,'csrf',0)", a.ID); err != nil {
		t.Fatal(err)
	}
	if err = repo.SaveSession(ctx, Session{User: User{ID: "missing"}, TokenHash: "invalid", CSRF: "x", ExpiresAt: expiry}); err == nil {
		t.Fatal("invalid session inserted")
	}
	if err = db.QueryRow("SELECT count(*) FROM sessions WHERE token_hash='expired'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("session transaction leaked: %d %v", count, err)
	}
	if err = repo.SaveSession(ctx, Session{User: a, TokenHash: "fresh", CSRF: "fresh", ExpiresAt: expiry.Add(time.Minute)}); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM sessions WHERE token_hash='expired'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("expiry cleanup: %d %v", count, err)
	}
}
