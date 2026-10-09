# 0001 — Single binary modular monolith

Status: accepted · 2026-10-08

**Context.** This template should be easy to fork and operate, with a verifiable vertical example and no service dependencies.

**Decision.** Use chi + Huma, database/sql + modernc SQLite, embedded goose SQL and Vite assets. Keep one SQLite connection with DSN-level pragmas and WAL. Services and repositories are explicitly constructed. Generate TypeScript from Huma OpenAPI. Require `make build` to build frontend first; preserve a dist placeholder for clean-checkout Go tooling.

**Consequences.** One deployable OS-specific executable; frontend build tools are development-only. Serialized DB access is a conscious starting tradeoff. Deployment is one instance on local storage. A future concurrency or database change requires measurements and migration tests. No ORM, DI container, plugin runtime, Redis or Docker requirement is introduced.
