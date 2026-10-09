# Monoseed contributor guide

Monoseed is a source-first SaaS template. A single pure-Go executable embeds a React application and SQL migrations. Prefer a small working vertical slice over generalized frameworks.

## Architecture and dependency direction

- `cmd/app`: CLI parsing, terminal password input, process signals. No business rules.
- `internal/app`: explicit constructors, module registration, HTTP lifecycle.
- `internal/platform`: config, SQLite/migrations, random tokens, domain errors, HTTP utilities.
- `internal/modules/{auth,workspace,notes}`: `handler.go` translates Huma inputs/errors; `service.go` owns validation/authorization; `queries.sql` owns parameterized SQL; sqlc generates `dbgen`, and `repository.go` owns transactions, domain error translation and API model mapping.
- `internal/webui`: embedded Vite output and SPA routing.
- `web/src/features`: feature pages, forms, queries; `app` owns routing/layout; `components/ui` contains locally maintained shadcn/ui components.
- `web/src/generated/api.ts`, `docs/openapi.json`, and `internal/modules/*/dbgen`: generated artifacts, never edit by hand.
- `tests/e2e`, `scripts`: isolated real-binary browser and restart tests.

Dependencies flow entry point → assembly → modules → platform. Services must not import Huma, `net/http`, or React; domain errors live in `platform/fault`. Handlers must not execute SQL. Use small consumer-owned interfaces where they enable service tests; no DI container or speculative interfaces. Module cross-dependencies must be explicit: Notes consumes Workspace membership checks, handlers consume authenticated identity.

## Add a business module

1. Copy the Notes structure, not its identifiers. Write a new migration with a `workspace_id` foreign key and appropriate workspace-leading indexes.
2. Add named parameterized queries in the module `queries.sql`, register a module output in root `sqlc.yaml`, run `make sqlc`, and define a repository using its generated `dbgen.Queries`. Every business read/update/delete must explicitly constrain `workspace_id`; never fetch by ID alone and filter afterward.
3. Define a service that authorizes membership before invoking its store, validates inputs even when called outside HTTP, and returns domain errors.
4. Register Huma operations with stable operation IDs, bounded request bodies, validated input and typed output. Register them in `app.Router`. The default guard requires a session; do not add unauthenticated operations casually.
5. Run `make types`. Use the generated schemas/paths with `openapi-fetch`; do not manually duplicate API DTOs in TypeScript. Zod form validation is UI behavior, not a second API contract.
6. Add a feature directory, route, workspace-qualified Query keys, accessible forms, and loading/error/empty states. Invalidate affected queries after successful mutations.
7. Add service tests, real temporary SQLite repository/API tests, cross-workspace tests (both different users and same user with multiple memberships), and an E2E flow for important behavior.
8. Run `make fmt` and **`make verify`**. Report actual results and any unavailable checks; never claim unexecuted tests passed.

## Database changes

Migrations are embedded from `internal/platform/database/migrations`. Add the next numbered goose SQL migration; never edit a migration already used by a deployment. Include Up/Down sections where a safe reversal is possible; document destructive reversals. Rehearse on a backup before production. Migrations run automatically at startup and errors abort startup. Do not change the conservative single-connection pool without measurements and an ADR. Connection-local pragmas belong in the DSN. Never copy an active WAL database file for backup; use `myapp backup create`.

## Verification and local tools

Use Go 1.27.1+ and Node 24 (`.nvmrc`). `make install` installs locked dependencies and Chromium; `make dev` starts Go + Vite. Run `make test` for a fast pass. `make verify` checks formatting, generated SQL/API drift, vet, race tests, TypeScript, ESLint, Vitest, production build, binary smoke and Playwright. Smoke/E2E use their own temporary databases. Never point tests at a developer or production data directory. Browser fixtures use `scripts/harness.mjs`; passwords enter the CLI over stdin, not argv.

## Prohibited changes

- Large dependencies/frameworks without a concrete need; ORM, DI container, Redis, mandatory Docker, plugin framework, microservices.
- Business logic or database queries accumulated in handlers.
- Editing previously applied migrations.
- Unscoped workspace business queries or trusting a client-supplied user/role.
- Duplicating existing infrastructure or inventing abstractions for unused future capabilities.
- Removing assertions, disabling type checking, skipping required tests to make checks green.
- Claiming test success without execution, or omitting tests for changed business behavior.
- Public registration, password logging, passwords in CLI arguments, raw session tokens in SQLite.

Record important architectural changes in `docs/decisions/NNNN-title.md`. Keep README and operational instructions synchronized with behavior. Future jobs, CAS and LLM modules remain unimplemented until a real feature needs them.

## Configuration changes

Root `.env.example` is the human-readable configuration catalog. Add settings to typed `config.Defaults`, loading, validation and the `Values` non-secret allowlist; wire them to their consumer. Test file/process/default precedence and effective behavior, not just parsing. Preserve explicit file errors and production HTTPS requirements. Never print secret settings via `myapp config show`; it must remain side-effect free. Keep schema/E2E/smoke independent of personal `.env` and inherited APP_* values.

## SQL generation

Root `sqlc.yaml` reads the existing goose migrations; do not add a duplicate schema.
`tools/sqlc` is an isolated Go tool module with a pinned generator and checksums; do not
add sqlc to the application go.mod. `make sqlc` generates checked-in module-local dbgen
code; `make sqlc-check` compares temporary output without modifying checked-in files.
Use `sqlc.arg(name)` and generated named parameter structs. Keep transactions and
`sql.ErrNoRows` / affected-row domain error mapping in repositories. Generated database
models are persistence types, not automatic API contracts: preserve explicit API DTOs.
Every business read/update/delete must still constrain workspace_id; sqlc is not an
authorization layer. Regenerate SQL and run make verify after query/schema changes.
