# A2UI Lab architecture

A local, single-process engineering laboratory. The first slice has no accounts or
workspaces. The HTTP listener is restricted to a loopback IP; browser requests are
checked against configured origins and hosts. A reverse proxy must provide access
control before remote deployment. Historical SaaS migrations remain immutable;
existing tables and data are retained but no longer exposed by the application.

```text
Mock Agent → semantic Event → Presentation Model → A2UI v0.9.1 adapter
                                                       ↓
SQLite append-only events → resumable SSE → protocol reducer → registry renderer
              ↑                                      ↓
              └──────── intent-based Action Router ───┘
```

`internal/agent` owns the runtime interface, with no protocol types. `presentation`
turns semantic events into a small display model. `a2ui` owns versioned envelopes,
the Lab catalog, validation and adaptation. `modules/lab` owns run lifecycle,
transactional persistence, HTTP translation and persisted-event streaming.

Each run has increasing sequence numbers. Semantic, presentation, protocol,
validation, action and lifecycle records share one event log. A database transaction
appends each batch and updates run status. Readers only observe committed batches.
A mock run is bounded and independent of SSE connections. Shutdown cancels workers;
startup marks unfinished runs interrupted with an appended event. SSE uses sequence
IDs, Last-Event-ID / after cursors and bounded connection windows for reconnects.
Replay only reduces stored A2UI events; it never invokes an Agent or Presenter.

The current production specification is [A2UI v0.9.1](https://a2ui.org/specification/v0.9.1-a2ui/)
(checked 2026-10-09). This implementation supports a documented subset, not the full
Basic Catalog. Its own versioned catalog adds LabToolCall, LabToolResult and
LabProgress. Text, Column, Row, Card and Button follow the basic component shapes.
Full schema/functions/templates, intent and generative modes are future work.

Invariants: Eino is an adapter, never the architecture. LLM output is semantic by
default. Tools return domain data. A2UI is presentation, not the domain. The renderer
has no business logic. Every rendered state is explained by an ordered event prefix.
Protocol code is versioned and independent of Agent execution. Actions are validated
against server-owned capabilities; rendered buttons cannot select arbitrary tools.

Storage uses the existing SQLite/goose/sqlc infrastructure. Migration 00003 adds
runs and events. Built-in scenarios are versioned code rather than a redundant
mutable table. Historical identity and notes tables are intentionally not dropped.

Human input is represented by a persisted waiting_input lifecycle state. Workers
finish after publishing input.required or approval.required. An allowlisted action
validates input against the scenario and resolves it in one atomic event batch.
Pending interactions survive restart; only running executions are recovered as
interrupted. No new tables or long-lived Agent goroutines are needed. See ADR 0008.
