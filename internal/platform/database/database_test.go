package database

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrationsPragmasReopenBackup(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := 0; i < 2; i++ {
		if err = Migrate(ctx, db); err != nil {
			t.Fatal(err)
		}
	}
	var tables int
	if err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('users','workspaces','workspace_members','sessions','notes')").Scan(&tables); err != nil || tables != 5 {
		t.Fatalf("tables=%d err=%v", tables, err)
	}
	// Force a replacement connection to verify connection-local pragmas.
	db.SetMaxIdleConns(0)
	for query, want := range map[string]int{"PRAGMA foreign_keys": 1, "PRAGMA busy_timeout": 5000} {
		var got int
		if err = db.QueryRow(query).Scan(&got); err != nil || got != want {
			t.Fatalf("%s=%d err=%v", query, got, err)
		}
	}
	db.SetMaxIdleConns(1)
	if _, err = db.Exec("INSERT INTO workspaces VALUES('w','Persistent','now')"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec("INSERT INTO notes VALUES('n','missing','Title','','now','now')"); err == nil {
		t.Fatal("foreign key not enforced")
	}
	backup := filepath.Join(t.TempDir(), "snapshot.db")
	if err = Backup(ctx, db, backup); err != nil {
		t.Fatal(err)
	}
	if err = Backup(ctx, db, backup); err == nil {
		t.Fatal("backup overwrote existing file")
	}
	restore, err := sql.Open("sqlite", backup)
	if err != nil {
		t.Fatal(err)
	}
	defer restore.Close()
	var name string
	if err = restore.QueryRow("SELECT name FROM workspaces WHERE id='w'").Scan(&name); err != nil || name != "Persistent" {
		t.Fatalf("backup missing data: %q %v", name, err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = Open(ctx, dir)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.QueryRow("SELECT name FROM workspaces WHERE id='w'").Scan(&name); err != nil || name != "Persistent" {
		t.Fatalf("reopen: %q %v", name, err)
	}
	info, err := os.Stat(filepath.Join(dir, "app.db"))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatalf("database permissions: %v %v", info, err)
	}
}

func TestMigrationFailure(t *testing.T) {
	db, err := Open(context.Background(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec("CREATE TABLE users(id TEXT)"); err != nil {
		t.Fatal(err)
	}
	if err = Migrate(context.Background(), db); err == nil {
		t.Fatal("conflicting schema should fail migration")
	}
}
