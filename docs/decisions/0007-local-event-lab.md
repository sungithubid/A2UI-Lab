# 0007: Local event-driven A2UI Lab

Status: accepted. Supersedes the active SaaS product described by ADR 0002/0004.

The initial product is a local engineering Lab. Remove auth/workspace/notes runtime
modules and pages, retain their historical migrations and data, and keep deployment,
configuration, database, API generation and verification infrastructure. Bind only
to a loopback IP and enforce browser origin/host boundaries. Remote sharing requires
an authenticated reverse proxy and is outside this slice.

Use application-owned semantic events and a separate presentation model. Persist
ordered events with run metadata in SQLite; use polling of committed events for SSE
rather than an in-memory broadcast queue. The bounded mock needs no distributed job
system. Sequence allocation, event append and status updates occur transactionally.
Replay uses the persisted protocol stream and never calls an LLM.

Target production A2UI v0.9.1 with an explicit Lab catalog subset. Do not claim full
Basic Catalog compliance. Eino, model credentials, intent/generative modes and larger
scenario suites follow only after the deterministic path is verified.
