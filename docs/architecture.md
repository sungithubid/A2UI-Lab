# A2UI Lab architecture

A local, single-process engineering laboratory. The first slice has no accounts or
workspaces. The HTTP listener is restricted to a loopback IP; browser requests are
checked against configured origins and hosts. A reverse proxy must provide access
control before remote deployment. Historical SaaS migrations remain immutable;
existing tables and data are retained but no longer exposed by the application.

```text
Persisted conversation → bounded semantic context → Mock Agent request
                                                    ↓
                                    semantic events → Presentation
                                                    ↓
                                  Markdown deltas / A2UI adapter
                                                    ↓
SQLite event log → resumable SSE → hybrid chat reducer → chat bubbles + surfaces
         ↑                                                   ↓
         └──────────── validated Action Router ──────────────┘
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
Replay reduces stored text deltas and A2UI events from the same prefix; it never invokes an Agent or Presenter. Legacy runs without the hybrid marker render their stored A2UI text once.

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

## Conversations and context

Migration 00004 groups runs into conversations with ordered turn indexes; existing
runs get independent conversations without rewriting their events. A new POST /runs
without conversationId starts a conversation. Continuation requires conversationId
and the current parentRunId. Service serialization rejects concurrent/stale parents,
running or waiting_input predecessors and more than 100 turns. Earlier-turn actions
are read-only. Each surface is scoped by run ID plus surface ID, avoiding collisions
between multiple `main` surfaces across turns.

Context is assembled on the server from persisted narrative and allowlisted semantic
facts. At most eight recent whole turns fit a 32,000-byte serialized request budget;
older turns are omitted, never silently summarized by another model. Request metadata
records selected run IDs and omissions. UI trees, trace snapshots and contact form
values are excluded. Ordinary prompts remain verbatim. Raw local history can contain
form input; this is not a general PII-redaction or secret-detection system.

Text is coalesced before persistence: first chunk immediately, then up to 50 ms or
128 characters, with flushes before non-text events, message-ID changes and terminal
states. Buffers are run-local. The single event log supplies both render paths and
records the observed chunks, so replay never reruns the timing policy. Narrative is
never duplicated into A2UI Text components. Card-local text still uses A2UI.

Trace is a projection of persisted context/request/response, tool, action and protocol
events. The exact application Request passed to Mock is persisted before invocation;
output metadata measures elapsed time and output characters, not tokens or cost.
No external LLM HTTP request exists in this slice. See ADR 0009.
