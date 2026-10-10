# Protocol and API contracts

Protocol baseline checked 2026-10-09: [A2UI v0.9.1, current production](https://a2ui.org/specification/v0.9.1-a2ui/).
The version literal is `v0.9.1`. Lab catalog ID:
`https://github.com/sungithubid/A2UI-Lab/catalog/v1` (an identifier, not a hosted endpoint).

Supported envelope subset: createSurface, updateComponents, updateDataModel,
deleteSurface. Exactly one operation per envelope. Flat adjacency-list components
have an `id` and `component`; `root` is the root. Components may arrive incrementally.
The supported catalog contains Text (literal or top-level data pointer), Column/Row
(static children), Card (child), Button (child and event action), LabToolCall,
LabToolResult, LabProgress and LabAlert. Lab-prefixed components are custom semantic
components, not official Basic Catalog components. See `a2ui-catalog.json`.

The MVP supports whole-object data replacement at `/` and top-level Text bindings.
Nested pointers, functions, templates, theming and other Basic Catalog features are
not implemented. Unsupported envelopes/catalogs and malformed known components
produce visible validation issues; unknown components get a diagnostic fallback.
Missing references render placeholders and cycles render errors, never recurse forever.
Server-generated envelopes are checked before persistence; a validator failure is an
explicit `validation.error` event. Client reducer diagnostics are derived from the
same stored prefix and displayed with the incoming event. No HTML/code is executed.

## REST

- POST `/api/runs`: `{prompt, scenarioId, conversationId?, parentRunId?}` → Run (201).
  Omit both IDs for a new conversation; continuation requires the latest finished
  parent in the named conversation (409 for stale/running/waiting input or 100 turns).
  The server builds history; clients cannot supply authoritative messages/UI history.
- GET `/api/runs/{id}/conversation`: all surviving runs in this conversation, ordered
  by turnIndex. Run includes conversationId and turnIndex.
- GET `/api/runs?offset=0`: up to 100 runs, newest first.
- GET `/api/runs/{id}`: run metadata/status and lastSeq.
- DELETE `/api/runs/{id}`: delete a non-running run and cascade its events (204).
- DELETE `/api/runs`: `{confirm: true}` → `{deleted: number}` (200). Explicit
  confirmation is required. Cancels and drains active workers, then atomically
  deletes every run and its events, including waiting interactions and paginated
  history. Creates/actions are serialized with deletion; no late worker writes
  can recreate history. Empty history returns zero; new runs remain available.
- GET `/api/runs/{id}/events?after=0`: up to 1000 ordered events for replay.
- GET `/api/scenarios`: built-in scenario metadata.
- POST `/api/runs/{id}/actions`: normalized envelope → updated Run.

OpenAPI is generated at `docs/openapi.json`, served at `/api/openapi.json`.
Each user message starts a run; a separate `/input` endpoint is unnecessary for this slice. Scenario editing and real Agent adapters remain deferred.
No workspace IDs or user-supplied roles are involved in this local-only model.

## Stream

GET `/api/runs/{id}/stream` is raw SSE, outside Huma's buffered timeout handler.
Each `event: lab` carries the same Event DTO as REST: id, runId, seq, kind, timestamp,
payload. `id:` is the sequence number; `Last-Event-ID` takes precedence over `after`.
Connections flush immediately, poll committed events at 100ms and reconnect after
10-second windows. Browsers retry at 500ms. No in-memory event bus or websocket.
Run execution is independent of the observing browser. Maximum eight concurrent
mock runs, each with a 20-second runtime budget. Shutdown cancels/drains workers;
startup appends run.interrupted to any previously running record.

## Actions

```json
{"version":1,"runId":"...","surfaceId":"main","componentId":"view-errors","category":"tool","action":"view_errors","data":{}}
```

Capabilities are scoped to the persisted scenario and its lifecycle:

| Scenario | Component | Action | Data | Ready state |
| --- | --- | --- | --- | --- |
| server-health | view-errors | view_errors | empty object | completed |
| support-form | ticket-form | submit_ticket | name, email, summary, priority | waiting_input |
| deployment-approval | deployment-confirmation | decide_deployment | decision: approve or reject | waiting_input |

All are category `tool`. Path/body run IDs and main surface must match. Server-side
validation rejects missing/extra fields, invalid email, unsupported priority and
oversized values. Identical retries return the original run; changed retries conflict.
The action, domain result, presentation, protocol updates and final status commit in
one transaction. Rejected input does not mutate the log.

`waiting_input` is persisted, not a live goroutine or an expiring network request.
Startup recovery only interrupts `running` runs. Form submission creates a local
`ticket.created` event; approval records `approval.resolved` and only then
`agent.resumed` / mock tool lifecycle. Rejection records `run.cancelled` with no tool
execution. This is deterministic fixture continuation, not Eino interrupt/resume.

New additive Lab catalog components:
- LabImageCard: bundled image, alt text, title, description and HTTPS URL; optional
  row layout for left-image/right-text lists. Native navigation opens a new tab and
  never submits a server action. Only `/scenario-images/[a-z0-9-]+.svg` images load.
- LabForm: bounded fields of type text/email/textarea/select and an event action.
  Draft edits are local; submitted values and disabled state are protocol snapshots.
- LabApproval: explicit approve/reject choices, operation summary and saved decision.

All three are custom Lab components, not additions to the official Basic Catalog.
External URL schemes/credentials, malformed form definitions and unsafe field names
are rejected by the renderer validator. Local illustrations require no external image
service or CSP relaxation. Replay never submits a form or decision; it restores the
saved values and disabled state from the event prefix.

## Hybrid rendering and trace events

New `run.started` events carry `rendering: "hybrid"`, conversationId and turnIndex.
`model.text_delta` contains messageId/text and renders through safe Markdown. A2UI
messages describe only cards, progress, forms, decisions and other structured UI.
Both channels share the run sequence and cursor. The first component update anchors
a Surface inside the Agent bubble; later updates preserve that position. IDs are
scoped by run. A new text block begins after an intervening Surface. Old runs without
the marker render their original A2UI snapshot path without duplicate narrative.

`trace.context` records source run IDs, omitted turns, byte/turn budgets and measured
construction time. `model.request` stores `{adapter:"mock", externalCall:false,
request:{prompt,scenarioId,messages,uiContext},textBuffer}` exactly before invocation.
Messages contain role/content and optional sourceRunId; uiContext contains semantic
facts and run/scenario/status references, never the component tree. These are Lab
adapter parameters, not a vendor's LLM API schema. `model.response` records status,
outputCharacters and durationMs. Tools/actions retain their existing event payloads.
The trace viewer derives spans from these ordered events, including interruption.

Continuation makes previous-turn actions read-only (409). Resolve pending inputs
first. Deleting a run removes its events and, if empty, its conversation; request
snapshots already stored in later runs are historical records and remain intact.

### Chat Completions messages preview

Trace projects the saved `model.request.request` into `{ "messages": [...] }`.
Each message contains only `role` and string `content`. Historical UI semantic facts
are appended as labeled data to the assistant message with the matching source run;
they are never promoted into system instructions or fabricated tool-call messages.
The current prompt is already the final user message and is not duplicated.
Missing or malformed saved context yields an explicit diagnostic and the original
snapshot remains inspectable. Existing stored runs use the same projection.

This is a read-only compatibility preview, not a complete provider HTTP request:
no model or sampling parameters are configured. Runtime fields, including scenario,
source IDs, textBuffer, adapter and externalCall, remain in the collapsed original
snapshot. Persisted events and the actual Mock request contract are unchanged.
See [ADR 0010](decisions/0010-chat-request-preview.md).
