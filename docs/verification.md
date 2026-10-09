# Verification record

Executed locally on 2026-10-08 (Asia/Shanghai), macOS arm64, Go 1.27.1, Node 24.19.0, npm 10.9.2. The default shell had Node 23; checks used the available Node 24 runtime by prepending its bin directory to PATH. Go's build cache was redirected to `/private/tmp/monoseed-go-cache` because of sandbox permissions.

| Executed command | Final result |
| --- | --- |
| `go mod tidy` | Passed; go.mod/go.sum completed |
| `npm ci --prefix web` | Passed from lockfile; 0 audit vulnerabilities reported |
| `make fmt` | Passed; Go and frontend/test scripts formatted |
| `go test ./cmd/... ./internal/...` | Passed |
| `go test -race ./cmd/... ./internal/...` | Passed |
| `make build` | Passed; embedded assets and CGO-free binary |
| `node scripts/smoke.mjs` | Passed; fresh boot, stdin admin, auth, Notes, SPA, backup, graceful restart, persistence, doctor |
| `npm run e2e --prefix web` | Passed; 3 Chromium tests including mobile and tenant isolation |
| `make dev` + Vite HTTP probes | Passed; Go and Vite started; proxied health response and transformed React module served; processes stopped afterward |
| `make verify` | Passed end-to-end, exit 0 |
| `go version -m bin/myapp` | Confirmed `CGO_ENABLED=0`, darwin/arm64 |

The final `make verify` includes generated OpenAPI/TypeScript drift checking, gofmt, go vet, Go race tests, TypeScript (including E2E sources), ESLint, Prettier, 3 Vitest tests, frontend/binary build, smoke and 3 Playwright tests. Existing successful Go test results were reused by Go's normal test cache on the final gate; the race suite also ran uncached earlier.

The executable is approximately 13 MiB on this platform. Smoke/E2E copy it into fresh temporary directories and run there, proving assets and migrations are embedded. Temporary test identities and databases are discarded. No production administrator or database was created in the project.

Initial restricted-sandbox smoke attempts could not bind loopback ports; they were rerun successfully with reviewed execution permissions. Dependency compatibility and an E2E screenshot-helper error found during implementation were fixed, then the complete gate was rerun. No assertions, type checks or test cases were disabled to obtain success.

Only macOS/Chromium was executed here. Linux/Windows runtime compatibility, other browser engines, sustained load and disaster-recovery operations on an actual deployment have not been validated. This is a functional starter, not a claim of independent security certification.

## Configuration update — 2026-10-09

`make fmt` and the complete `make verify` passed after adding `.env.example`, dotenv loading, APP_ENV/log/session settings, configurable HTTP deadlines and limits, and `myapp config show`. The gate included fresh race tests for config/CLI/application behavior, schema drift, frontend checks, production build, binary smoke and all 3 Chromium E2E tests.

New tests cover process/file/default precedence (including empty values), optional versus explicit missing files, invalid syntax/values, production HTTPS rules, the example's completeness, readable config output without database creation, configured server fields, actual request deadline behavior, and 413 responses when lowering the global body cap. A Huma/global body-limit interaction discovered during implementation was fixed without weakening assertions.

An additional real-binary check used a temporary explicit `.env` to verify `config show` reported a 93-second idle timeout as `1m33s` without creating the data directory. `make dev` was then started with that file: its custom data path and text log format took effect, local development overrides remained correct, and the Vite-proxied `/readyz` returned ready. Processes were stopped and the temporary directory was cleaned up. The repository's personal `.env` was neither created nor changed.

## Development startup account — 2026-10-09

`make fmt` and the full `make verify` passed using Go 1.27.1 and Node 24.21.0. The default shell had no npm executable, so the installed Node 24.21.0 bin directory was explicitly prepended to PATH for checks.

New Go tests verify development-only credential validation, password redaction (including actual CLI output), optional bootstrap behavior, absence of identity creation during `App.Open`, atomic user/owner workspace creation, idempotent startup without password replacement, development loopback Origin aliases, incorrect-port/host rejection, and CSRF protection on the alias. Defaults still create no account.

Binary smoke passed. All 4 Chromium E2E tests passed, including a fixture bootstrapped through the real `serve` command and browser login/logout through both 127.0.0.1 and localhost. Smoke retains isolated test configuration; the E2E server deliberately uses explicit development bootstrap settings to cover this workflow. Personal .env, identities and databases were not changed.

## UI components and internationalization — 2026-10-09

`make fmt` and the final complete `make verify` passed (exit 0) using Go 1.27.1 and
Node 24.21.0. Generated API drift, gofmt, vet, Go race tests, TypeScript, Prettier,
9 Vitest tests, embedded frontend / pure-Go binary build, binary smoke and all
5 Chromium E2E tests passed. ESLint reported zero errors and one TanStack Table v8 /
React Compiler compatibility warning; no checks were disabled. React Compiler is not
configured for this project (see ADR 0005).

New tests cover supported browser preference order, explicit saved overrides, blocked
localStorage, catalog and interpolation parity, translated validation/errors, document
language, client sorting/pagination, Chinese automatic detection, language persistence
across reload, a 14-note server-paginated table, Radix menus, modal focus / Escape dismissal
and focus restoration after editing from a table action menu. A detached focus target
found by the new browser assertion was fixed by resolving the current control by note ID;
the assertion remains enabled. Existing CRUD, workspace isolation, mobile navigation and
loopback startup-login tests also passed. Screenshots of the Chinese table and existing
English desktop/mobile pages were generated; the Chinese table was visually inspected.

All browser/smoke data was created in harness-owned temporary databases. Personal .env
and development data were not changed. UI/component usage and the current-page sorting
limitation are documented in docs/frontend.md and both READMEs.

## sqlc repositories — 2026-10-09

`make sqlc`, `make fmt` and the complete final `make verify` passed (exit 0).
Auth, Workspace and Notes now use module-local sqlc v1.31.0 generated database/sql
queries; no production repository manually calls Scan. Existing migrations and API
schemas are unchanged. The generator and its checksums live in the separate tools/sqlc
module. An application dependency-graph check (`go list -deps ./cmd/app`) confirmed
that no sqlc-dev module is linked into the application.

The gate passed SQL output drift checking, API drift checking, the Node generation
integrity test, gofmt, vet, Go race tests, TypeScript, Prettier, 9 Vitest tests, frontend
and CGO-free binary builds, binary smoke and all 5 Chromium E2E tests. ESLint retains
the previously documented single TanStack / React Compiler compatibility warning
and reports zero errors; no checks or assertions were disabled.

New temporary-SQLite repository tests validate Notes field mapping, UPDATE RETURNING,
unchanged creation timestamps, count/order/offset pagination, empty pages and missing
records; workspace identity/membership mapping, cross-user isolation and atomic rollback;
credential/session mapping, the ten-session bound, isolation during session trimming,
expired-session pruning and rollback after a failed session insert. Existing authentication,
bootstrap, same-user/different-user workspace isolation and Notes tests also passed.
The generation integrity test runs in a separate temporary project fixture: stale,
missing and extra output files cause --check to fail without changing files; regeneration
repairs the file set; invalid SQL does not overwrite artifacts. Personal .env and
application data were not touched.

Usage, module ownership, DTO boundaries and tool upgrade instructions are documented
in docs/sqlc.md, both READMEs, AGENTS.md and ADR 0006.
