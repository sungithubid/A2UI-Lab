package notes

import (
	"context"
	"errors"
	"testing"

	"monoseed/internal/platform/database"
	"monoseed/internal/platform/fault"
)

func TestRepositoryScopesAllQueries(t *testing.T) {
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
		if _, err = db.Exec("INSERT INTO workspaces VALUES(?,?,?)", id, id, "now"); err != nil {
			t.Fatal(err)
		}
	}
	repo := NewRepository(db)
	_, err = repo.Create(ctx, Note{ID: "n", WorkspaceID: "a", Title: "Secret", CreatedAt: "now", UpdatedAt: "now"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Get(ctx, "b", "n"); !errors.Is(err, fault.ErrNotFound) {
		t.Fatalf("cross-workspace read: %v", err)
	}
	if _, err = repo.Update(ctx, Note{ID: "n", WorkspaceID: "b", Title: "stolen", UpdatedAt: "now"}); !errors.Is(err, fault.ErrNotFound) {
		t.Fatalf("cross-workspace update: %v", err)
	}
	if err = repo.Delete(ctx, "b", "n"); !errors.Is(err, fault.ErrNotFound) {
		t.Fatalf("cross-workspace delete: %v", err)
	}
	page, err := repo.List(ctx, "b", 1, 20)
	if err != nil || page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("cross-workspace list: %+v %v", page, err)
	}
	n, err := repo.Get(ctx, "a", "n")
	if err != nil || n.Title != "Secret" {
		t.Fatalf("original altered: %+v %v", n, err)
	}
	n.Title = "Updated"
	if _, err = repo.Update(ctx, n); err != nil {
		t.Fatal(err)
	}
	if err = repo.Delete(ctx, "a", "n"); err != nil {
		t.Fatal(err)
	}
}

func TestRepositoryGeneratedMappingAndPagination(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("INSERT INTO workspaces VALUES('w','Workspace','now')"); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	for _, id := range []string{"a", "b", "c"} {
		want := Note{ID: id, WorkspaceID: "w", Title: "Title " + id, Content: "正文 " + id, CreatedAt: "2026-01-01", UpdatedAt: "2026-01-02"}
		got, err := repo.Create(ctx, want)
		if err != nil || got != want {
			t.Fatalf("create mapping: %+v %v", got, err)
		}
	}
	page, err := repo.List(ctx, "w", 2, 2)
	if err != nil || page.Total != 3 || page.Page != 2 || page.PageSize != 2 || len(page.Items) != 1 || page.Items[0].ID != "a" {
		t.Fatalf("stable order / offset / count: %+v %v", page, err)
	}
	input := Note{ID: "a", WorkspaceID: "w", Title: "Changed", Content: "Updated content", CreatedAt: "must not replace", UpdatedAt: "2026-01-03"}
	got, err := repo.Update(ctx, input)
	input.CreatedAt = "2026-01-01"
	if err != nil || got != input {
		t.Fatalf("update returning mapping: %+v %v", got, err)
	}
	if _, err = repo.Update(ctx, Note{ID: "missing", WorkspaceID: "w", Title: "Missing"}); !errors.Is(err, fault.ErrNotFound) {
		t.Fatalf("missing update: %v", err)
	}
	if err = repo.Delete(ctx, "w", "missing"); !errors.Is(err, fault.ErrNotFound) {
		t.Fatalf("missing delete: %v", err)
	}
	empty, err := repo.List(ctx, "w", 4, 2)
	if err != nil || empty.Items == nil || len(empty.Items) != 0 || empty.Total != 3 {
		t.Fatalf("empty page: %+v %v", empty, err)
	}
}
