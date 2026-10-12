# ADR 0012: interaction teaching baseline

## Context

The Lab teaches frontend/backend chat contracts. Happy-path fixtures alone do not
show the distinction between stopped execution, disconnected delivery and replay,
or how an identical submitted action avoids duplicate outcomes.

## Decision

Keep Mock and the persisted event pipeline. Add a stream-error fixture that emits
partial Markdown and a semantic error, without claiming agent completion. Add a
typed POST /api/runs/{id}/stop lifecycle operation that records a stop request,
cancels the run worker and drains it before returning the saved state. It reuses
interrupted status and introduces no tables or framework dependencies.

Add an optional collapsed Learning lab to the existing experiment page. Recipes
link to actual event checkpoints. Manual SSE disconnection closes only EventSource;
manual reconnection uses the cached contiguous prefix as its after cursor. Automatic
EventSource reconnection retains Last-Event-ID behavior. A retry exercise resubmits
the exact persisted Action without changing the server's single-interaction contract.
Controls are read-only during replay and historical inspection.

## Consequences

Stopping preserves received text and allows a subsequent turn. Pending human input
is not an active execution and cannot be stopped through this endpoint. A completion
race returns the actual persisted state. Accepted cancellation survives caller
disconnection; already interrupted retries append nothing. Stop requests accepted
while the same worker is still draining are recorded at most once.

No new protocol component, database migration, LLM provider or external tracing service
is introduced. Teaching examples and gate tests use local fixtures and isolated data.
Local drafts, connection indicators and exercise receipts are not conversation replay
state; narrative, outcomes and surfaces remain derived from persisted event prefixes.
