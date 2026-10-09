# A2UI Lab contributor guide

A2UI Lab is a local, event-driven Agent UI laboratory. Keep one pure-Go executable
embedding React assets and goose migrations; use the existing chi/Huma/sqlc/SQLite
infrastructure. Prefer working vertical slices over frameworks.

## Boundaries

- cmd/app owns CLI/process signals; internal/app wires lifecycle and HTTP.
- internal/agent owns the Agent interface; adapters emit semantic events only.
  Future Eino types stay inside internal/agent/eino.
- internal/event owns normalized JSON event envelopes and semantic payloads.
- internal/presentation maps semantics to a display model, independent of A2UI.
- internal/a2ui owns protocol version, Lab catalog, validation and deterministic mapping.
- internal/modules/lab owns run lifecycle, repository transactions and typed REST/SSE.
  Services must not import Huma/net/http; handlers must not execute SQL.
- web/src/lib/a2ui owns pure protocol state; visual components use a registry.
  Renderer code must not own tools/business logic. Never execute incoming HTML/code.
- web/src/generated/api.ts, docs/openapi.json and dbgen are generated, never hand-edited.

Agent → semantic events → presentation → A2UI → renderer → action router.
Every UI state must be explainable by a persisted event prefix. Replay never calls an
Agent or LLM. Protocol version-specific types stay isolated. Mock remains usable
without credentials. Actions describe intent and require server-side allowlisting.

## Data and security

Local MVP has no auth/workspace/notes runtime. Listener must bind a loopback IP;
retain Host/Origin checks. Remote use requires an authenticated reverse proxy.
Do not reintroduce tenancy or registration without an actual requirement. Historical
SaaS migrations/data are retained; do not modify already applied migrations.

Add numbered goose Up/Down migrations; document destructive Down paths. Preserve
single-connection SQLite and DSN pragmas. Use CLI backup create, never copy a live WAL
file. Events are append-only except explicit deletion of a terminal run. Allocate
sequence numbers and update status in the same transaction. Read events by run_id.

SQL belongs in queries.sql with sqlc.arg named parameters. Use make sqlc; the pinned
generator belongs only in tools/sqlc. Keep transactions/errors/mapping in repositories.
No ORM, DI container, Redis, distributed queue, mandatory Docker or plugin framework.

## Contracts, config and verification

REST contracts come from Go/Huma. Run make types and use generated schemas with
openapi-fetch. Keep reducers independent from React and Agent adapters. Malformed,
unknown and incomplete protocol input must yield explicit diagnostics, never crash.

.env.example is the human-readable settings catalog. Wire settings through typed
Defaults, Load, Validate and non-secret Values; test precedence and effective behavior.
Keep explicit file errors, production HTTPS, side-effect-free config show and secret
redaction. Test harnesses must ignore personal .env/inherited APP_*.

Use Go 1.27.1+ and Node 24. make install installs locked dependencies/Chromium.
Run make fmt, make test and make verify. The latter includes generator drift, vet,
race tests, TS/ESLint/Prettier/Vitest, embedded binary build, smoke and Playwright.
Use isolated temporary databases only. Never remove assertions or skip required
checks to make the gate pass; report exact unavailable checks and actual results.

Update README.md, README_zh.md and docs with behavior. Record architectural changes
in docs/decisions/NNNN-title.md. Eino/model configuration is the second slice;
intent/generative/raw-editor experiments follow only after deterministic behavior.
