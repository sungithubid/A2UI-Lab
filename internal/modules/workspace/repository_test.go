package workspace

import (
	"context"
	"errors"
	"monoseed/internal/platform/database"
	"monoseed/internal/platform/fault"
	"testing"
)

func TestRepositoryMembershipAndAtomicCreate(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"a", "b"} {
		if _, err = db.Exec("INSERT INTO users VALUES(?,?,?,?)", id, id+"@example.test", "hash", "now"); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db)
	w, err := repo.Create(ctx, "a", "中文 workspace")
	if err != nil {
		t.Fatal(err)
	}
	rows, err := repo.List(ctx, "a")
	if err != nil || len(rows) != 1 || rows[0] != w || w.Role != "owner" {
		t.Fatalf("mapping: %+v %v", rows, err)
	}
	role, err := repo.Role(ctx, "a", w.ID)
	if err != nil || role != "owner" {
		t.Fatalf("role: %s %v", role, err)
	}
	if _, err = repo.Role(ctx, "b", w.ID); !errors.Is(err, fault.ErrForbidden) {
		t.Fatalf("cross-user role: %v", err)
	}
	rows, err = repo.List(ctx, "b")
	if err != nil || rows == nil || len(rows) != 0 {
		t.Fatalf("isolation / empty list: %+v %v", rows, err)
	}
	if _, err = repo.Create(ctx, "missing", "Rollback"); err == nil {
		t.Fatal("missing member accepted")
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM workspaces").Scan(&count); err != nil || count != 1 {
		t.Fatalf("workspace transaction leaked: %d %v", count, err)
	}
}
