package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sungithubid/A2UI-Lab/internal/app"
	"github.com/sungithubid/A2UI-Lab/internal/platform/config"
	"github.com/sungithubid/A2UI-Lab/internal/platform/database"
)

var version = "dev"

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	slog.SetDefault(log)
	if err := run(os.Args[1:], log); err != nil {
		slog.Error("command failed", "error", err)
		os.Exit(1)
	}
}

func run(args []string, log *slog.Logger) error {
	if len(args) == 0 {
		return errors.New("usage: a2ui-lab serve | migrate | backup create | doctor | version | openapi | config show")
	}
	if args[0] == "version" {
		fmt.Println(version)
		return nil
	}
	if args[0] != "serve" && args[0] != "migrate" && args[0] != "backup" && args[0] != "doctor" && args[0] != "openapi" && args[0] != "config" {
		return fmt.Errorf("unknown command %q", args[0])
	}
	c, err := config.Load()
	if err != nil {
		return err
	}

	if args[0] == "config" {
		if len(args) != 2 || args[1] != "show" {
			return errors.New("usage: a2ui-lab config show")
		}
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(c.Values())
	}
	opts := &slog.HandlerOptions{Level: c.LogLevel}
	var handler slog.Handler = slog.NewJSONHandler(os.Stderr, opts)
	if c.LogFormat == "text" {
		handler = slog.NewTextHandler(os.Stderr, opts)
	}
	log = slog.New(handler).With("env", c.Env)
	slog.SetDefault(log)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Schema generation is side-effect free and never opens the application's database.
	if args[0] == "openapi" {
		_, api := app.Router(c, nil, log)
		return json.NewEncoder(os.Stdout).Encode(api.OpenAPI())
	}
	a, err := app.Open(ctx, c, log)
	if err != nil {
		return fmt.Errorf("initialize application: %w", err)
	}
	defer a.Close()
	switch args[0] {
	case "serve":
		return a.Serve(ctx)
	case "migrate":
		fmt.Println("Migrations applied")
		return nil
	case "backup":
		if len(args) < 2 || args[1] != "create" {
			return errors.New("usage: a2ui-lab backup create --output /absolute/path.db")
		}
		f := flag.NewFlagSet("backup create", flag.ContinueOnError)
		output := f.String("output", "", "absolute backup path (must not exist)")
		if err = f.Parse(args[2:]); err != nil {
			return err
		}
		backupCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
		if err = database.Backup(backupCtx, a.DB, *output); err != nil {
			return err
		}
		fmt.Println(*output)
		return nil
	case "doctor":
		var journal, integrity string
		var foreignKeys, busy int
		for query, dest := range map[string]any{"PRAGMA journal_mode": &journal, "PRAGMA foreign_keys": &foreignKeys, "PRAGMA busy_timeout": &busy, "PRAGMA quick_check": &integrity} {
			if err = a.DB.QueryRowContext(ctx, query).Scan(dest); err != nil {
				return err
			}
		}
		if journal != "wal" || foreignKeys != 1 || busy != 5000 || integrity != "ok" {
			return fmt.Errorf("database check failed: journal=%s foreign_keys=%d busy_timeout=%d integrity=%s", journal, foreignKeys, busy, integrity)
		}
		fmt.Printf("OK: SQLite WAL, foreign keys, busy timeout, integrity; data=%s\n", c.DataDir)
		return nil
	}
	return nil
}
