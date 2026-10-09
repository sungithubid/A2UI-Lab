# Monoseed

English | [简体中文](README_zh.md)

A source-first, AI-friendly SaaS starter: Go + React + SQLite, deployed as **one executable**. Notes is the complete reference module to copy when adding business features.

## Quick start

Build tools: **Go 1.27.1+**, **Node 24** (`nvm install && nvm use`), npm and make. A C compiler is needed for Go's race detector during verification; the production application builds with `CGO_ENABLED=0` and has no C library, Node, Redis or database-server runtime dependency. On Linux, Playwright may need OS browser libraries (`cd web && npx playwright install --with-deps chromium`).

```sh
make install
make build
export APP_DATA_DIR="$HOME/.local/share/monoseed"
./bin/myapp admin create --email owner@example.com --workspace 'My workspace'
./bin/myapp serve
```

The administrator command prompts for a hidden password (12–72 bytes). Open **http://localhost:8080**, sign in, create a note, and create/switch workspaces from the sidebar. Public signup is disabled. Each CLI-created user receives a workspace with the `owner` role.

For automation, pipe a secret from your secret manager to `admin create --email … --password-stdin`. Never pass passwords as arguments. Tests use fixed, disposable credentials only in isolated temporary fixtures.

## Development

```sh
make dev
```

Open **http://localhost:5173** or **http://127.0.0.1:5173**. Vite proxies `/api` to Go on `127.0.0.1:8080`; React has HMR. Restart `make dev` after Go changes. The development script defaults to an absolute `.data` path in this checkout. Initialize the same directory in another terminal:

```sh
APP_DATA_DIR="$PWD/.data" ./bin/myapp-dev admin create --email owner@example.com
```

`make dev` also reads the root `.env`: `APP_DATA_DIR` from the shell or file overrides the development directory. It deliberately fixes `APP_ENV=development`, `APP_ADDR=127.0.0.1:8080`, `APP_ORIGIN=http://localhost:5173` and `APP_COOKIE_SECURE=false` for the Vite proxy; other settings, including logs and deadlines, remain configurable. Production defaults to `os.UserConfigDir()/monoseed`, which is independent of the working directory. Always set a stable absolute path for a deployed service.

### Optional development account on startup

There is no built-in username/password. To have `make dev` create a local account, set these in your `.env`:

```dotenv
APP_DEV_ADMIN_EMAIL=admin@example.com
APP_DEV_ADMIN_PASSWORD=local-dev-password-123
APP_DEV_ADMIN_WORKSPACE=Development
```

Restart `make dev`, then sign in with that email and password. The password must be 12–72 bytes. The settings are optional and permitted only with `APP_ENV=development`; the `serve` command creates the user and owner workspace atomically before accepting requests. An existing user with the same email is retained, including their original password, so changing this setting does not reset passwords. Clear both email and password to stop automatic initialization. CLI operations such as `config show`, `migrate` and `doctor` never create this account. `config show` redacts the password, and startup logs never print it.

Development HTTP origins accept `localhost` and `127.0.0.1` on the configured port. Other hosts/ports are rejected, CSRF tokens are still required, and production/test retain exact origin matching. Cookies belong to the selected host; sign in again when switching between the two addresses.

| Command | Purpose |
| --- | --- |
| `make install` | Download Go dependencies, `npm ci`, Chromium |
| `make dev` | Build Go development server and run it alongside Vite |
| `make fmt` | gofmt and Prettier |
| `make sqlc` | Generate typed Go queries from SQL and goose migrations |
| `make sqlc-check` | Check generated SQL code without rewriting artifacts |
| `make types` | Export Huma OpenAPI and generate TypeScript types |
| `make test` | Go tests and Vitest |
| `make verify` | Full quality gate, including build, smoke and E2E |
| `make build` | Build frontend, then `bin/myapp` with CGO disabled |
| `make smoke` | Rebuild and test a standalone binary across restart |
| `make e2e` | Rebuild and exercise real Chromium against fresh fixtures |

`make verify` is the required completion gate for code changes. Go package checks explicitly target `cmd` and `internal` to avoid third-party Go files inside `node_modules`.

## Configuration and operations

All supported settings, defaults, units and production examples are listed in **[.env.example](.env.example)**:

```sh
cp .env.example .env
# Edit .env, then inspect the merged, validated configuration (no database access):
./bin/myapp config show
./bin/myapp serve
```

The Go CLI automatically reads `.env` in its working directory. **Process environment > `.env` > built-in defaults**; an explicitly empty value selects the built-in default. `.env` is optional and ignored by Git. To launch from another directory, set `APP_ENV_FILE=/absolute/path/.env`; a missing explicit file is an error. Set `APP_ENV_FILE=-` to disable file loading. This selector is read only from the process environment; files cannot redirect it. No `.env.local` / `.env.production` cascade is performed. Use literal values and absolute data paths, not shell substitutions such as `$HOME` or `~`.

| Setting | Default | Meaning |
| --- | --- | --- |
| `APP_DEV_ADMIN_EMAIL` / `APP_DEV_ADMIN_PASSWORD` | empty | Optional development startup account; password is redacted in config output |
| `APP_DEV_ADMIN_WORKSPACE` | `Development` | Workspace name when creating the development account |
| `APP_ENV` | `development` | `development`, `test`, `production`; production requires HTTPS + Secure cookie |
| `APP_ADDR` | `127.0.0.1:8080` | HTTP bind address |
| `APP_DATA_DIR` | OS user config directory + `/monoseed` | Absolute persistent data directory |
| `APP_ORIGIN` | `http://localhost:8080` | Exact browser origin, no trailing slash |
| `APP_LOG_LEVEL` / `APP_LOG_FORMAT` | `info` / `json` | debug/info/warn/error; json/text |
| `APP_COOKIE_SECURE` | `false` | Must be true for HTTPS |
| `APP_SESSION_TTL` | `168h` | Session lifetime; minimum 1s |
| `APP_HTTP_READ_HEADER_TIMEOUT` | `5s` | Read request headers |
| `APP_HTTP_READ_TIMEOUT` | `15s` | Read entire request, including body |
| `APP_HTTP_REQUEST_TIMEOUT` | `30s` | Total request handling deadline; 503 on timeout |
| `APP_HTTP_WRITE_TIMEOUT` | `35s` | Write response; must exceed request timeout |
| `APP_HTTP_IDLE_TIMEOUT` | `60s` | Keep-Alive idle timeout |
| `APP_HTTP_SHUTDOWN_TIMEOUT` | `10s` | Graceful shutdown wait |
| `APP_HTTP_HEALTH_TIMEOUT` | `2s` | Database readiness probe deadline |
| `APP_HTTP_MAX_HEADER_BYTES` | `1048576` | Header limit (bytes), max 16 MiB |
| `APP_HTTP_MAX_BODY_BYTES` | `131072` | Global body cap (bytes), max 64 MiB; smaller API caps still apply |

Durations use Go syntax, such as `500ms`, `15s`, `2m`, `168h` (not `7d`). Timeouts must be positive; invalid values abort startup with the variable name. Read timeout must cover header timeout; health timeout cannot exceed request timeout. Settings are read at startup, so restart to apply edits. Environment labels do not disable authentication or change timeout/log defaults.

Remote origins require HTTPS. Production sets `APP_ENV=production` and uses a TLS reverse proxy with `APP_ORIGIN=https://your-domain.example` and `APP_COOKIE_SECURE=true`. Keep the binary bound to loopback or a private interface. TLS termination is external; it is not bundled into the application. The process does not trust forwarded client-IP headers, so the built-in login limit is shared by clients behind one proxy; configure an additional per-client proxy limit when deploying publicly.

```sh
./bin/myapp version
./bin/myapp migrate
./bin/myapp doctor
./bin/myapp backup create --output /absolute/new-backup.db
```

Migrations also run before startup; failures stop the application. `doctor` opens/migrates the configured database, then checks WAL, foreign keys, busy timeout and integrity. Backups use SQLite `VACUUM INTO`, work while the app is online and refuse to overwrite files. They contain password hashes and active sessions: store them privately. To restore, stop all app processes, preserve the old data directory, create a new private directory, copy the snapshot to `app.db`, and point `APP_DATA_DIR` there. Do not combine a restored database with old `-wal` or `-shm` files.

Graceful shutdown handles SIGINT/SIGTERM with a configurable deadline (10 seconds by default). Health endpoints: `/healthz` (process), `/readyz` (database). Huma schema: `/api/openapi.json`. Mutating API requests require a trusted `Origin` (exact configured origin outside local development); after login, include the `X-CSRF-Token` returned by login or `/api/auth/me`. Sessions expire after seven days by default and logout revokes them immediately.

## Repository

```text
cmd/app/                        CLI
internal/app/                   Composition and HTTP lifecycle
internal/platform/              Config, SQLite, migrations, HTTP, security, errors
internal/modules/auth/          Users, bcrypt, sessions, login guard
internal/modules/workspace/     Membership, listing and creation
internal/modules/notes/         Handler → service → repository reference
internal/webui/                 Embedded production assets and SPA fallback
web/src/app/                    Router and layout
web/src/features/               Auth, dashboard, notes, workspaces, account
web/src/components/ui/          Locally maintained shadcn/ui primitives
web/src/generated/              Generated OpenAPI types
scripts/                        Dev, types, smoke and isolated test server
tests/e2e/                      Browser workflows and tenant isolation
AGENTS.md                       Agent contribution contract
docs/                           Architecture, development, ADRs, OpenAPI
```

## Scope

Included: secure login/logout, multi-workspace membership, Notes CRUD/pagination, account page, responsive UI, notifications, typed API, SQLite backups, production static caching, tests and AI development instructions.

Roles `owner`, `admin`, `member` are persisted; all three may CRUD Notes. There is no global superuser bypass. The CLI initializes owners; invitations, membership editing, password reset/change, MFA, SSO, public signup, billing, audit history and concurrent edit conflict resolution are not included. Workspace creation/listing/switching are available; destructive workspace management is deliberately absent. The login limiter is process-local. Run one instance against one local SQLite database, not multiple replicas or network storage.

Jobs, content-addressed storage and LLM/agent integration are documented extension points, not placeholder frameworks. See [architecture](docs/architecture.md), [development](docs/development.md), [decisions](docs/decisions/README.md) and [AGENTS.md](AGENTS.md).

Local execution results are recorded in [verification](docs/verification.md).

## UI components and internationalization

The locally maintained shadcn/ui-style collection includes Dialog, DropdownMenu, Select,
Tabs, Table/DataTable, Badge and Avatar. Notes demonstrates modal editing, action menus,
and card/table views with server pagination and sorting of the current page.

The application supports English and Simplified Chinese. It detects the first supported
browser language on first visit; the language menu on login and in the sidebar saves manual
choices. See [frontend guide](docs/frontend.md) for component APIs, pagination semantics
and adding translations.

## Typed SQL with sqlc

Auth, Workspace and Notes repositories use sqlc-generated `database/sql` queries.
Edit module `queries.sql`, then run `make sqlc`. `make verify` checks generated-code drift.
The generator is pinned in an isolated `tools/sqlc` Go module; building/running the app
needs no sqlc binary or additional runtime dependency. Goose remains the migration engine.
See [SQL development guide](docs/sqlc.md) for named parameters, transactions and adding modules.
