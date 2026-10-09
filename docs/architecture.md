# Architecture

## Runtime and boundaries

A modular monolith owns one HTTP server and one local SQLite file. `cmd/app` parses commands. `app.Open` validates configuration, opens/migrates SQLite and assembles explicit constructors. `app.Router` registers chi infrastructure and Huma module handlers. Domain services return `platform/fault` errors, not HTTP errors. Each module owns SQL in `queries.sql`; sqlc generates module-local `dbgen` packages using `database/sql`. Repositories own transactions, domain error conversion and API model mapping. The pinned generator lives in an isolated Go tool module, outside application dependencies. React communicates only through the generated API client.

The Notes chain is `notes.Register` → `notes.Service` → `notes.Repository`. The service depends on small `Store` and `Membership` interfaces. Every service operation checks current membership; every repository read/update/delete includes a workspace predicate. Both are required. Workspace authorization is never inferred from a selected dropdown, a note ID, a cookie role, or cached UI state.

Roles are stored as owner/admin/member. All are collaborators for Notes. Future membership management must explicitly authorize owners/admins and prevent removal of the last owner; this first version has no membership mutation HTTP endpoint.

## Identity and request security

CLI creates a bcrypt password hash and an owner workspace in one transaction. No public registration or hidden administrator account exists. Session cookies hold 256-bit random tokens; only SHA-256 hashes are stored in SQLite. A second independent random value is used for CSRF. Cookies are HttpOnly, SameSite=Strict, path `/`, optionally Secure (required for HTTPS). Sessions expire after seven days by default (APP_SESSION_TTL), are capped at ten per account, and expired rows are pruned on login. The UI retrieves CSRF via authenticated `/me` and holds it in memory.

Unsafe API methods require a trusted Origin, including login. Production/test use exact matching; local HTTP development permits localhost and 127.0.0.1 aliases on the configured port only. Authenticated writes additionally require a matching session CSRF header. The server never trusts forwarded IP headers. Login attempts are capped at ten per minute per socket IP with a bounded 4096-entry map; a full map fails closed. Limits reset on process restart. A reverse proxy should enforce per-client limits when appropriate.

Huma validates inputs; services repeat domain validation so CLI and non-HTTP callers remain safe. Transport errors are RFC 9457-style problem responses. Unexpected server errors are logged without leaking database details. Bodies are bounded to 128 KiB globally and 4 KiB for login/workspace creation. Server read-header/read/write/idle timeouts default to 5/15/35/60 seconds; requests default to a 30-second deadline. These, shutdown/readiness deadlines and global body/header limits are configurable via APP_HTTP_* variables. Huma operation body caps are clamped to the global cap; its per-body deadline is disabled so it cannot override the HTTP server read deadline. Request IDs and structured logs connect failures to requests without logging passwords, tokens or bodies.

## Database lifecycle

The initial pool allows one open/idle connection. It serializes access and avoids write contention or read-then-write deadlocks caused by acquiring a second connection inside a transaction. DSN pragmas configure every replacement connection: WAL, foreign keys, five-second busy timeout, synchronous NORMAL. One process on a local disk is the supported topology; WAL/NORMAL favors application-crash consistency but can lose the latest acknowledged transactions after power loss. Use a documented durability decision if changing this tradeoff.

Embedded goose migrations run before serving. Provider-local migration state avoids process-global configuration. The schema stores UTC RFC3339Nano timestamps and Unix session expiry. Notes pagination is stable by creation time plus ID; count and rows use one read transaction. Backup uses `VACUUM INTO` for a consistent standalone snapshot, with private permissions and no overwrite. The operation occupies the single application connection if called in-process; the CLI uses its own connection. Restore to a fresh directory while stopped.

## Assets and schema

Vite writes `internal/webui/dist`; `go:embed all:dist` includes those assets. A tracked `.gitkeep` permits Go tooling before building the frontend; a final binary must use `make build`. Unknown `/api/*` URLs return JSON 404s. Missing asset/file URLs return 404. Extensionless UI routes use index.html. Hashed `/assets/*` files cache for a year; index.html and other public files use no-cache. APIs use no-store.

Huma Go types produce OpenAPI; `openapi-typescript` produces checked-in TypeScript definitions. `openapi-fetch` types requests and responses; `required()` rejects unexpected absent success bodies. `make types-check` regenerates, compares and restores artifacts even on failure. It does not require a server or touch the real database.

## Future boundaries

- **SQLite jobs:** add a jobs migration and platform worker only when needed. Define atomic claims, leases, idempotency and retry/backoff; cancellation belongs to app lifecycle. Never hold a DB transaction during an external call.
- **CAS storage:** add a storage module for SHA-256-addressed local blobs with metadata and references. Define atomic file writes, authorization and mark/sweep GC before exposing uploads; back up both files and SQLite consistently.
- **LLM/agents:** add a business module with the smallest provider adapter actually used. Keep prompts and quotas in that module, persist usage, propagate cancellation, and register SSE as a `net/http` route with its own lifetime instead of the ordinary 30-second request wrapper. Eino is an option when orchestration needs justify it.

None of these future interfaces or dependencies exists in the current implementation.

## Configuration

`platform/config.Defaults` defines typed defaults. `Load` reads an optional current-directory `.env` with godotenv into a private map, then overlays process values without mutating the global environment. `APP_ENV_FILE` selects an explicit file or `-` to disable files; a missing explicit file fails startup. Empty values choose defaults. `Validate` enforces environment/log enums, positive durations, compatible deadlines and bounded sizes. `production` requires an HTTPS origin and Secure cookies; no environment disables authentication.

`myapp config show` returns an explicit allowlist of effective non-secret settings using environment-variable names and readable duration units, without opening SQLite. Logs use the configured slog level/format and include the environment. Root `.env.example` is the configuration catalog; tests check that every reported setting is documented. Development uses Node's native env-file loader with literal values and fixes Vite's local endpoints; production Go loading uses the same documented literal-value convention. Schema generation and binary test fixtures ignore personal APP_* configuration.

## Optional development bootstrap

`APP_DEV_ADMIN_EMAIL` and `APP_DEV_ADMIN_PASSWORD` opt into a local owner account, with `APP_DEV_ADMIN_WORKSPACE` naming its initial workspace. Validation rejects credentials outside development and requires both values together. Only `App.Serve` invokes initialization via the existing Auth service, before accepting HTTP traffic; `App.Open`, migrations, doctor and config inspection never create users. The existing atomic CreateAdmin transaction handles concurrent/repeated starts without replacing passwords or duplicating workspaces. Passwords are redacted in config output and never logged. Defaults remain empty.

Local HTTP development accepts the two loopback hostnames supported by the Vite URLs, with the same scheme/port. The alias handling grants no cross-origin read access and does not bypass synchronizer CSRF tokens; production/test and remote HTTPS origins remain exact matches. Host-specific cookies mean a fresh login is needed when switching hostnames.
