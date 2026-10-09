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
