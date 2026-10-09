# Development

Use Go 1.27.1+ and Node 24. `make install` installs locked Go/npm dependencies and
Chromium. `make dev` serves Go on 127.0.0.1:8080 and Vite on localhost:5173.
React changes use HMR; restart `make dev` after Go changes. No bootstrap user or
model credentials are needed. The Lab interface currently uses English labels.

The first slice removed active auth/workspace/notes modules, their pages and tests.
Their historical migrations stay immutable for upgrade safety. Database/platform,
local UI components, API generation and test harnesses are reused.

- Agent adapters implement `internal/agent.Agent`, emit application-owned events,
  honor context cancellation and close their stream. Never return A2UI from a tool.
- Add semantic payloads in `internal/event` only for real behaviors.
- Map them into `presentation.Model`; version-specific protocol mapping belongs in
  `internal/a2ui`. Update the protocol subset documentation when extending it.
- REST input/output types belong in Go. Run `make types`; frontend code uses generated
  OpenAPI types with openapi-fetch. SSE has the same Event envelope as REST events.
- SQL lives in `internal/modules/lab/queries.sql`; run `make sqlc`. Do not edit dbgen.
- Protocol processing in `web/src/lib/a2ui.ts` is pure and independent of Agent code.
  Rendering uses a registry. Keep malformed/unknown UI contained and visible.
- Actions must pass the server's capability allowlist. Replay disables server actions.

Run `make fmt`, `make test`, `make verify` before delivery. Do not point tests at a
user's data directory. Smoke/E2E create isolated databases via `scripts/harness.mjs`.
Use the CLI backup command before rehearsing a migration against an existing database.
See [verification](verification.md) for the quality gate and [sqlc](sqlc.md) for generation.
