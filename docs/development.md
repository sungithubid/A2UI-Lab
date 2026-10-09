# Development workflow

1. Install Go 1.27.1+, Node 24, npm, make and a C compiler for race tests. `nvm use`; `make install`.
2. Run `make dev`, initialize an owner using the same absolute APP_DATA_DIR, and open http://localhost:5173 or http://127.0.0.1:5173. Vite owns HMR; restart for Go changes. The terminal process manages both child processes and shuts them down together.
3. Follow Notes as the golden path. Add a migration, module queries.sql, generated dbgen, repository, service, handler, typed client query and feature page. Run `make sqlc` after SQL/schema changes; see [SQL guide](sqlc.md). Keep mutation Query keys scoped to workspace and reset editors on workspace change.
4. Run `make types` whenever Go input/output structs or operation registration change. Both `docs/openapi.json` and `web/src/generated/api.ts` are source-controlled build artifacts.
5. Add tests alongside changed behavior. Run `make fmt`, then `make verify` before handing off.

## Tests and isolation

Go integration tests use real files under `t.TempDir`, with fresh migrations. Service tests use small fakes to prove unauthorized calls never reach a store. Repository tests use malicious workspace/ID combinations. API tests exercise cookies, logout, Origin, CSRF, validation, pagination, membership revocation and tenant isolation. Database tests check repeated migrations, failed migrations, foreign keys after connection replacement, backups and reopen persistence.

Vitest + Testing Library exercise the Notes form: blank/whitespace validation, editing, error retention and pending state. Playwright uses Chromium and a temporary binary-backed server on 4173. It creates two administrators itself and exercises login, CRUD, reload, workspace switching, account, logout, and cross-user API attacks. The browser API contexts have separate cookie jars. The smoke test starts an empty binary on 4189, initializes identity through stdin, creates a note, validates assets/backup, gracefully restarts and verifies the same session and note persist. These ports must be free; tests fail instead of reusing a developer server.

On Linux, use `cd web && npx playwright install --with-deps chromium` if browser libraries are absent. Network access is needed only for dependency/browser installation. Restrictive agent sandboxes may require permission to start loopback listeners or launch Chromium. Record such failures precisely; do not skip assertions or count an unexecuted test as passing.

## API changes

Use stable operation IDs; Huma's default guard protects all registered module operations except `login`. Write DTOs once in Go. `nullable:"false"` marks collection responses whose repositories always return empty arrays rather than null. Form Zod schemas validate UX; they must be assignable to generated Go-derived types. Preserve explicit workspace path parameters for all tenant business data.

## Release and template reuse

`make build VERSION=0.1.0` builds frontend first, then a CGO-free binary with version metadata. Copy only `bin/myapp` to the target host with a persistent private data directory. The Go executable is OS/architecture-specific; cross-build intentionally with GOOS/GOARCH as appropriate. Verify backups and restore on a staging directory before migrations. Do not deploy more than one replica to shared SQLite storage.

To derive a product, rename the Go module and imports, binary/branding, cookie and default data directory names. Preserve the reference module until the first new module passes the same authorization tests. Remove Notes when no longer useful; keep shared infrastructure. Add a short ADR for changes to database, auth, persistence or dependency boundaries.

## Upstream references

The implementation follows the actual [Huma middleware API](https://huma.rocks/features/middleware/), [goose Provider API](https://pressly.github.io/goose/blog/2023/goose-provider/), and [modernc SQLite DSN pragmas](https://pkg.go.dev/modernc.org/sqlite). UI routing uses [TanStack code-based routes](https://tanstack.com/router/latest/docs/routing/code-based-routing). Check the installed dependency source and current primary documentation before changing these interfaces.

## Local configuration

Copy `.env.example` to `.env` and edit literal values; no shell `source` is required. Run `./bin/myapp config show` to see the validated effective values. Shell variables override file values. Use `APP_ENV_FILE=/absolute/path/.env` outside the project directory or `APP_ENV_FILE=-` to disable files. Go loading does not export file variables into the process environment. Changes require a restart.

`make dev` reads the file too, keeps its fixed local Vite/API addresses, forces development mode and insecure local cookies, and respects other settings. A configured `APP_DATA_DIR` is used by both Go and development. Without one, development uses `.data` while standalone CLI uses the OS user config directory. Smoke/E2E and schema generation strip inherited APP_* settings and disable file loading, so a developer's custom production/timeout settings cannot redirect their databases or break fixtures.

When adding settings, update `config.Defaults`, loading/validation, the `Values` allowlist, `.env.example`, and the actual consumer. Include parsing/precedence tests and a consumer test for behavioral settings. Never expose secrets through `config show`.

For optional startup credentials, set `APP_DEV_ADMIN_EMAIL`, `APP_DEV_ADMIN_PASSWORD` (12–72 bytes), and optionally `APP_DEV_ADMIN_WORKSPACE` in `.env`, then restart `make dev`. Existing accounts keep their old password; this is initialization, not password recovery. Clear both credential fields to disable it. Keep credentials out of version-controlled files. `config show` reports a redacted password. The development alias handling accepts only localhost/127.0.0.1 at the configured HTTP port; test and production keep exact Origin matching.
