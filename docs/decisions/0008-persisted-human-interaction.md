# 0008: Persisted human interaction scenarios

Status: accepted.

Resource cards/lists, support forms and deployment confirmations extend the existing
deterministic Lab path. Domain resource/input/approval events map through presentation
to additive custom Lab catalog components. Bundled SVG illustrations keep the default
experience offline; HTTPS document links are ordinary local navigation.

Human input must outlive browsers and server restarts. A waiting_input run has no
active worker and no finished_at timestamp. Server-side allowlisted actions validate
against scenario, status and run/component identity, then append domain/action/protocol
records with final status in one transaction. Identical actions are idempotent; a
different submission or opposite decision conflicts. Only approve emits simulated
deployment tool events; reject cancels without execution. Nothing touches a real
support system, sends email, or changes infrastructure.

Draft form edits are local renderer state. Submitted values and disabled controls
are persisted protocol snapshots, so replay is deterministic and cannot submit again.
This prepares a human-interaction boundary without pretending to implement Eino
interrupt/resume. The existing runs/events schema suffices; no migration is required.
