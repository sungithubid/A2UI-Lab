# A2UI Lab

[English](README.md) | [简体中文](README_zh.md)

A local engineering playground for streaming Agent UIs: run deterministic scenarios, inspect semantic and protocol events, interact with generated surfaces, and replay persisted runs without calling an LLM.

---

## Features

- **Zero-Config & Standalone**: Pure Go single binary embedding React assets and goose SQLite migrations. Runs instantly without external API keys, accounts, or cloud dependencies.
- **Hybrid Multi-Turn Chat & Traces**: User bubbles on the right, Agent replies on the left, with streaming Markdown and interleaved A2UI surfaces. Backend-owned history and local traces expose context construction, actual Mock requests, tools, and actions.
- **Deterministic Scenario Ladder**: 7 built-in progressive scenarios covering streaming text, tool calling, rich media, and human-in-the-loop approvals.
- **End-to-End Protocol Observability**: Protocol Inspector and Timeline provide real-time inspection of raw JSON envelopes, component hierarchies, data model bindings, and sequential events.
- **Event-Sourced Deterministic Replay**: Every UI state is fully explainable by a persisted event prefix. Step, Reset, and Play reconstruct state entirely offline without LLM invocations.
- **Secure Sandboxed Interaction**: Controlled rendering guarantees incoming code/HTML is never dynamically executed. Human-in-the-loop forms and approvals persist cleanly across restarts in `waiting_input`.

---

## Quick Start

### 1. Launch in Development

```sh
make install
make dev
# Open http://localhost:5173 — no account, API key or external service needed.
```

### 2. Basic Walkthrough

![A2UI Lab Overview](docs/images/hybrid-chat.png)

1. **Select a Scenario**: Choose a scenario from the dropdown (e.g. **Server health**).
2. **Start a Run**: Enter a prompt and click **New run**. The Mock Agent progressively streams text, tool invocations, and progress, while the presentation layer renders a bound status card.
3. **Interact**: Click **View errors** to send a normalized, validated action back to the server.
4. **Inspect & Replay**:
   - Open **Protocol Inspector** to examine raw messages (`updateComponents` / `updateDataModel`), component hierarchies, and data model validations.
   - Use **Timeline** to track the complete event lifecycle.
   - Use **Reset**, **Step**, and **Play** to reconstruct the UI from stored events, or click **Live** to return to the active run.
5. **Manage Runs**:
   - **Delete run**: Deletes the selected non-running run.
   - **Delete all runs**: Confirms, halts active workers, and purges all runs and event histories.
   - Drag the horizontal divider in Protocol Inspector to resize panes (supports Up/Down micro-adjustments, Home/End boundaries, and double-click reset).

---

## Multi-Turn Chat and Request Traces

**New run** starts a new conversation. Once a turn finishes, choose **Next scenario**, enter a follow-up in the chat composer, and click **Send message**. Resolve pending forms/approvals first. Earlier turns retain Markdown, surfaces, and submitted results. Use **Inspect turn** / **Trace turn** to inspect a turn and **Return to latest** to resume; historical actions and replay submissions are read-only.

The left **Trace** panel shows context construction, Agent requests, tools, actions, and A2UI output with timings and JSON. Select the request span to inspect the exact `prompt`, `scenarioId`, `messages`, and `uiContext` passed to Mock. No external LLM is called, and no provider HTTP parameters, token counts, or costs are fabricated. Follow-ups use a deterministic template to demonstrate the received context.

The client submits only the new prompt, scenario, `conversationId`, and `parentRunId`. The backend builds context from persisted events: at most eight previous whole turns, within 32,000 serialized UTF-8 bytes for the entire request. Whole-turn omissions are visible in Trace. Conversations are limited to 100 turns. UI enters context as semantic facts rather than full component trees.

Ordinary prompts and local form events remain stored in SQLite; submitted contact-form fields are excluded from subsequent model context. Deleting one run does not rewrite request snapshots already saved by later turns. Use **Delete all runs** to clear all history.

---

## Built-in Scenarios

Built with 7 progressive scenarios illustrating the Agent UI evolution ladder (see [Scenario Ladder](docs/scenarios.md)):

- **Streaming Text (`streaming-text`)**: Buffered Mock chunks rendered as Markdown lists, tables, and code blocks; text-only replies create no A2UI surface.
- **Server Health (`server-health`)**: Tool calling, execution progress polling, bound status cards, and post-action dispatching.
- **Tool Failure (`tool-error`)**: Explicit tool failure visualization, error alert cards, and resilient state archiving.
- **Linked Image Card (`image-card`)**: Safe bundled illustration rendering and external documentation links opening in new tabs.
- **Illustrated Resource List (`image-list`)**: Progressively appended resource components with left-image/right-text layouts.
- **Support Ticket Form (`support-form`)**: Controlled interactive forms with field validation and event-logged submissions in `waiting_input`.
- **Deployment Confirmation (`deployment-approval`)**: High-risk action human-in-the-loop (HITL) approval/rejection with idempotent decision handling.

> **Note**: This first slice focuses on deterministic presentation. Eino, real model output, interrupt/resume, and raw JSON editors are planned for future milestones.

---

## Architecture & Data Flow

Data and events flow through a strict unidirectional pipeline:

```text
Backend conversation history → bounded agent.Request → Mock Agent
   ↓ semantic events + exact request/response trace
Presentation
   ├─ text-delta → Markdown chat blocks
   └─ structured UI → A2UI messages → controlled Surface renderer
   ↓ persisted together in SQLite (conversation / run / event sequence)
SSE → Conversation + Trace + Protocol Inspector → event-prefix replay
   ↓ intent actions
Action Router → server allowlist / validation → persisted results
```

### Core Invariants

- **Protocol Specification**: Targets a documented subset of the [A2UI v0.9.1 specification](https://a2ui.org/specification/v0.9.1-a2ui/) and an isolated Lab catalog.
- **Persistence & Replay**: Single-connection SQLite stores conversations, ordered runs, and append-only event logs. Replay reduces stored events offline without re-running agents or LLMs.
- **Local Security**: Unauthenticated daemon binds strictly to loopback (`127.0.0.1:8080`) with Host and Origin validation. Remote deployments require an authenticated reverse proxy and HTTPS Origin.
- **Data Migration**: Migration 00003 adds runs/events. Migration 00004 adds conversations and ordered
turns, preserving each old run as its own conversation. Historical Monoseed migrations and data are retained. Back up before upgrading; specify `APP_DATA_DIR` explicitly when migrating an old database.

---

## Build and Operate

### Requirements
- **Build/Development**: Go 1.27.1+, Node 24
- **Production**: Only the compiled Go executable (includes embedded web assets and goose SQL migrations)

### Operations CLI

```sh
# Build standalone binary
make build

# Start daemon
./bin/a2ui-lab serve

# View effective configuration (redacted, side-effect free)
./bin/a2ui-lab config show

# Database integrity and readiness checks
./bin/a2ui-lab doctor

# Create hot backup snapshot (using SQLite VACUUM INTO)
./bin/a2ui-lab backup create --output /absolute/path/backup.db
```

### Configuration & Storage
- Copy `.env.example` to `.env` to customize settings. Precedence: **Process Environment > `.env` file > Defaults**.
- Set `APP_ENV_FILE=-` to completely disable file loading.
- Default data directory is OS user config `/ a2ui-lab` (`.data` during `make dev`). Always use the CLI backup command; never copy live WAL files.

---

## Quality Gate

```sh
make fmt      # Format Go and frontend code
make test     # Unit tests (Go & Vitest)
make verify   # Full gate check
```

`make verify` enforces generator drift checks (sqlc / OpenAPI), Go vet and race detection, TypeScript typechecks, ESLint, Prettier, Vitest, production binary build, binary smoke tests, and Playwright end-to-end tests.

---

## Documentation

- [Architecture Guide](docs/architecture.md)
- [Scenario Evolution Ladder](docs/scenarios.md)
- [Protocol Subset](docs/protocol.md)
- [Local Lab Decision Record (ADR 0007)](docs/decisions/0007-local-event-lab.md)
- [Persisted Human Interaction (ADR 0008)](docs/decisions/0008-persisted-human-interaction.md)
- [Hybrid Conversations and Traces (ADR 0009)](docs/decisions/0009-hybrid-conversations-and-traces.md)
- [Development Workflow](docs/development.md)
- [Verification Baseline](docs/verification.md)
