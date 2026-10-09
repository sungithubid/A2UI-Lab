# A2UI Lab

A local engineering playground for streaming Agent UIs: run deterministic scenarios,
inspect semantic and protocol events, interact with generated surfaces, and replay
persisted runs without calling an LLM.

```sh
make install
make dev
# Open http://localhost:5173 — no account, API key or external service needed.
```

Choose **Server health**, enter a prompt and click **New run**. The Mock Agent emits
text, a metrics tool call/result and progress. A deterministic presentation layer
creates a bound status card. **View errors** sends a normalized, validated action.
Inspect raw messages and parsed state in Protocol Inspector, and all event categories
in Timeline. Reset / Step / Play reconstruct the UI from persisted events; Live
returns to the current run. Run history remains available after restart.

Three built-in scenarios: server health, streaming text and tool failure. Mock output
is canned and independent of the prompt; prompts are recorded as experiment input.
This first slice uses deterministic presentation only. Eino and real model output,
approvals, additional scenarios, intent/generative comparison and a raw editor are
future slices, not simulated features in this UI.

## Build and operate

Requires Go 1.27.1+ and Node 24 for development/building. Runtime requires only the
Go executable. Vite assets and goose SQL migrations are embedded.

```sh
make build
./bin/a2ui-lab serve
./bin/a2ui-lab config show
./bin/a2ui-lab doctor
./bin/a2ui-lab backup create --output /absolute/path/backup.db
```

Copy `.env.example` to `.env` to customize configuration. Process values override
file values and defaults. `APP_ENV_FILE=-` disables file loading. `config show`
is side-effect free and prints only an allowlist. Default data location is the OS
user config directory / `a2ui-lab`; `make dev` uses `.data`. Never copy a live WAL
file for backup. Use the CLI snapshot operation.

The unauthenticated Lab binds only to loopback IPs (default `127.0.0.1:8080`) and
checks browser Origin/Host. Remote exposure is outside the local MVP; provide an
authenticated reverse proxy if deploying remotely. Production still requires an
HTTPS Origin. No public registration, workspace or account model remains.

## Architecture

Agent → semantic events → presentation model → A2UI → renderer → action router.
SQLite stores run metadata and an ordered append-only event log. SSE carries committed
events and resumes via sequence cursors. Replay reduces stored events without Agent
execution. The protocol adapter targets the [current A2UI v0.9.1 specification](https://a2ui.org/specification/v0.9.1-a2ui/)
using a documented Lab catalog subset, not full Basic Catalog compliance.

See [architecture](docs/architecture.md), [development](docs/development.md),
[protocol subset](docs/protocol.md), [verification](docs/verification.md), and
[the local Lab ADR](docs/decisions/0007-local-event-lab.md).

Migration 00003 adds runs/events. Historical Monoseed identity/notes migrations and
stored data are retained, but old SaaS APIs, UI and admin commands have been removed.
Back up an existing data directory before upgrading. The new default directory does
not automatically import the old Monoseed directory; set `APP_DATA_DIR` explicitly
when you intend to migrate it.

## Quality gate

```sh
make fmt
make test
make verify
```

`make verify` checks generated SQL/API drift, Go formatting/vet/race tests, TypeScript,
ESLint, Prettier, Vitest, production build, binary smoke and Playwright. Test harnesses
use isolated temporary databases and ignore personal `.env` and inherited `APP_*`.
