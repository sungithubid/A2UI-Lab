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

- POST `/api/runs`: `{prompt, scenarioId}` → Run (201), starts bounded mock execution.
- GET `/api/runs?offset=0`: up to 100 runs, newest first.
- GET `/api/runs/{id}`: run metadata/status and lastSeq.
- DELETE `/api/runs/{id}`: delete a terminal run and cascade its events (204).
- GET `/api/runs/{id}/events?after=0`: up to 1000 ordered events for replay.
- GET `/api/scenarios`: built-in scenario metadata.
- POST `/api/runs/{id}/actions`: normalized envelope → updated Run.

OpenAPI is generated at `docs/openapi.json`, served at `/api/openapi.json`.
Input is part of run creation in this slice; multi-turn `/input`, scenario editing
and scenario-specific endpoints are deferred until real Agent conversations exist.
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

Only that capability on a completed server-health run is accepted. The path and body
run IDs must match. The action is idempotent: the first call persists action.received,
action.completed, presentation.event and an errors surface; retries return the run.
The result is deterministic fixture data, not a real infrastructure tool.
Local replay/expand controls never dispatch backend tools. Future agent/navigation
actions require explicit router capabilities, not arbitrary string dispatch.
