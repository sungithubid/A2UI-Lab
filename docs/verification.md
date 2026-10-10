# Verification

`make test`: Go tests and Vitest.

`make verify`: sqlc drift check, OpenAPI/TS drift check, generator regression tests,
Go formatting, vet, race tests, TypeScript, ESLint, Prettier, Vitest, production build,
binary smoke and Playwright. Nothing is skipped to make this gate pass.

Go coverage includes semantic-to-presentation-to-protocol mapping, deterministic
Mock/cancellation, malformed protocol/actions, SQLite transactional rollback and
concurrent sequence allocation, run lifecycle/recovery, local Origin/Host protection,
request limits, health endpoints and SSE flush/resumption. Existing database backup,
pragma, migration and config precedence tests remain.

Frontend coverage includes reset/step deterministic replay, duplicate/out-of-order
observations, missing sequences, invalid protocol/catalog/components, unknown types,
cycles/missing references, registry actions and inspector details. Playwright uses
a real embedded binary to stream a demo, inspect it, dispatch an action, replay and
reload; another flow exercises failure. Smoke restarts the binary and compares the
persisted event stream, verifies backup/delete/doctor and embedded SPA behavior.

All database/browser tests use temporary directories. Harness subprocesses ignore
inherited APP_* and personal .env. A real LLM is never required by the quality gate.

Interactive scenario tests cover linked images, streamed image/text rows, form validation
and persisted values, approve/reject exclusivity, concurrent duplicate submissions,
changed retries, replay-disabled controls and pending-state recovery. Binary smoke
restarts with a pending form and submits it after recovery. Browser tests verify image
loading and navigation with an intercepted destination, requiring no external network.

Bulk-deletion tests require explicit confirmation, drain active workers, remove more
than one history page and cascade events, then verify that new runs still work.
Browser tests cover toolbar alignment, modal cancellation and recoverable errors,
cleared history after reload, and Inspector resizing by pointer/keyboard with saved
proportions, reset and mobile layout.

Hybrid conversation coverage includes exact persisted request/adapter equality,
conversation isolation, stale-parent/concurrent submission rejection, pending-input
serialization, contact-field exclusion, explicit context budgets, complete event
pagination, and legacy migration Up/Down preserving events. Reducer tests verify
interleaved text/surfaces, missing-prefix handling, deduplication and legacy rendering.
Markdown tests cover GFM, incomplete streaming syntax, blocked HTML/unsafe URLs and
remote images. Browser flows verify bubble alignment, request/tool inspection,
context-aware Mock follow-ups, reload, prior-turn read-only actions, replay and mobile
layout. Binary smoke restarts and compares saved multi-turn context and trace events.

Request-preview coverage verifies role/content ordering, Chinese text preservation,
UI fact placement in assistant turns, prompt deduplication, immutable source snapshots,
and diagnostics for malformed or unmatched context. Browser tests compare the
expanded original snapshot with persisted events and restore the preview on reload.

Plan-decision tests cover recommended/alternative/custom choices, blank and oversized
input, unknown IDs and forged labels, pending-state restoration with a replacement
service, concurrent identical retries, changed-choice conflicts, read-only protocol
snapshots, and decision facts in follow-up context. Browser coverage verifies all
three paths, reload, event-identical replay, Trace action data and mobile overflow.

Inline choice-input coverage verifies that option 3 contains the editable textarea
without an expansion step, uses stable English labels after confirmation, and
restores submitted text as read-only during reload/replay.
