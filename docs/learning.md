# P0: interaction teaching baseline

[English](learning.md) | [简体中文](learning_zh.md)

Learn the contract between a chat page and its backend before replacing Mock with a
model. All nine scenarios use local fixtures, the same event pipeline and the same
persisted history. A scenario selects fixture behavior; its prompt is not interpreted
by a real model. Request-preview JSON is a projection, not a provider HTTP request.

All scenarios also support the optional per-turn Deep thinking switch. Its labelled
summary events are separate from the answer and excluded from later context.
See [thinking output](thinking.md) for request/event examples and adapter boundaries.

![Learning lab: saved event checkpoints and an identical Action retry](images/learning-lab.png)

## Start with one complete interaction

1. Run `make dev`, choose **Decision · implementation plan**, and click **New run**.
2. Expand **Learning lab**. Its event checkpoint buttons select an actual saved event
   in Protocol Inspector. Disabled checkpoints have not occurred in the visible prefix.
3. Inspect `model.request`: the exact application request is stored; Trace also
   offers a role/content preview. Inspect `decision.required` for candidate IDs.
4. Confirm a plan, or submit text inside option 3. Inspect `action.received`,
   `decision.resolved` and `action.completed`. The original card becomes read-only.
5. Click **Retry last Action**. It submits the exact saved envelope. The response's
   event sequence should stay unchanged; the retry adds no second result.
6. Send a follow-up. Inspect **Build context** and **Agent request · Mock** in Trace:
   the selected plan appears as a semantic fact attached to the earlier turn.
7. Reload and select the run. Reset/Step/Play reconstruct saved events and disable
   submissions. They do not repeat the choice or invoke the Agent.

## Trace the five contracts

| Question | Source of truth | Read this code |
| --- | --- | --- |
| What does the frontend submit? | New prompt/scenario, plus conversationId/parentRunId for continuation; never the whole UI/history | [lab-page.tsx](../web/src/features/lab/lab-page.tsx), [experiment.tsx](../web/src/features/lab/experiment.tsx), [handler.go](../internal/modules/lab/handler.go) |
| What does the backend save? | Conversations, ordered runs, semantic/presentation/protocol/lifecycle/action events; batch and status updates in one transaction | [repository.go](../internal/modules/lab/repository.go), [queries.sql](../internal/modules/lab/queries.sql) |
| What does the Agent receive? | Application-owned Request, built from persisted narrative and allowlisted semantic facts | [agent.go](../internal/agent/agent.go), [context.go](../internal/modules/lab/context.go) |
| How does output become UI? | Semantic event → display model → Markdown or versioned A2UI → pure reducer → registry | [presentation.go](../internal/presentation/presentation.go), [protocol.go](../internal/a2ui/protocol.go), [chat.ts](../web/src/lib/chat.ts), [renderer.tsx](../web/src/features/renderer/renderer.tsx) |
| How does an interaction become history? | Validated Action → atomic semantic outcome and locked UI snapshot → next-turn context | [action.go](../internal/action/action.go), [Service.Action](../internal/modules/lab/service.go), [context.go](../internal/modules/lab/context.go) |

The renderer owns interaction controls, not business execution. The backend owns
history, capabilities, lifecycle and validation. Preserve this split when copying a
vertical slice into another project.

## Recipes for every scenario

Every row starts with `POST /api/runs` using that scenarioId and a nonempty prompt.
All events listed below are persisted with monotonically increasing run-local seq.
They are checkpoints, not an exhaustive list or promises of fixed sequence numbers.

| Scenario / suggested prompt | Saved output → presentation / UI | Interaction sent by frontend | Next-turn context |
| --- | --- | --- | --- |
| streaming-text / Show a streaming answer | model.text_delta → text-delta → Markdown; zero A2UI surfaces | None; Stop run is a separate lifecycle endpoint | User prompt + saved narrative; stopped turns also carry interrupted status |
| server-health / Analyze server health | tool.started, agent.progress, tool.completed → tool-call/progress/tool-result/health → LabToolCall, LabProgress, LabToolResult and a Card bound to /summary | view_errors; main / view-errors / empty data | Narrative, tool.completed and action.completed facts |
| tool-error / Demonstrate a tool failure | tool.started then error.occurred → error → LabAlert; run.failed | None | Partial narrative, failed status and error fact |
| stream-error / Show partial output followed by a stream failure | Text first, then error.occurred → LabAlert; run.failed; no agent.completed | None | Incomplete narrative, failed status and mock_stream_disconnected fact |
| image-card / Recommend an Agent UI resource | resource.recommended → image-card → LabImageCard | Safe link navigation; no Action API request | Resource domain fact, not the component tree |
| image-list / Find resources for building a local Agent UI lab | Three resource.found events → image-row → three row-layout cards in one surface | Safe link navigation; no Action API request | Ordered resource facts |
| support-form / Help me open a support ticket | input.required → form → LabForm; run.waiting_input | submit_ticket; main / ticket-form / name, email, summary, priority | input.required + sanitized ticket outcome; submitted contact fields are excluded |
| deployment-approval / Prepare a staging deployment for my review | approval.required → approval → LabApproval; run.waiting_input | decide_deployment; main / deployment-confirmation / decision: approve or reject | Approval decision and local simulated outcome; rejection ends cancelled |
| plan-decision / Analyze the API upgrade options and ask me to choose | decision.required → choice → LabChoice; run.waiting_input | choose_plan; main / plan-decision / choiceId, plus text only for custom | Candidate and resolved-choice facts; submitted custom text is included |

Fixture output is in [mock.go](../internal/agent/mock/mock.go) and
[scenarios.go](../internal/agent/mock/scenarios.go). Interactive protocol shapes and
read-only result snapshots are in [interactive.go](../internal/a2ui/interactive.go).
The frontend controls are in [interactive.tsx](../web/src/features/renderer/interactive.tsx).
Trace and A2UI trees are excluded from Agent history. Ordinary prompts remain
verbatim; this policy is not a general secret/PII detector.

## A concrete request and Action

A continuation sends only:

```json
{
  "prompt": "Continue with the plan I confirmed",
  "scenarioId": "streaming-text",
  "conversationId": "<conversation ID>",
  "parentRunId": "<latest finished run ID>"
}
```

A recommended-plan click sends `POST /api/runs/{id}/actions`:

```json
{
  "version": 1,
  "runId": "<run ID>",
  "surfaceId": "main",
  "componentId": "plan-decision",
  "category": "tool",
  "action": "choose_plan",
  "data": { "choiceId": "incremental" }
}
```

Custom input uses `{"choiceId":"custom","text":"Migrate read APIs first."}`.
Labels/recommendations come from persisted candidate definitions, not client-supplied
titles. The server resolves the interaction in one event/status transaction. Identical
valid envelope retries on the latest turn return the saved run; a changed choice returns
409. Validation errors return 422. Rejected requests add no action/result events.
This is the current single-interaction contract, not a general-purpose idempotency-key
API. Once a later turn exists, earlier-turn actions are rejected, including retries.

## Resilience exercises and expected evidence

| Exercise | Steps | Evidence / invariant |
| --- | --- | --- |
| Partial upstream failure | Start stream-error; wait; Reset, Step, Play; reload | Text precedes the error, buffer tail survives, LabAlert and run.failed persist; replay adds no events |
| User interruption | Start streaming-text; click Stop run before completion | POST /stop records runtime.stop_requested, cancels/drains the worker, flushes received text and normally ends run.interrupted |
| Delivery disconnect | During streaming-text, expand Learning lab; Disconnect SSE; wait; Reconnect SSE | Backend keeps running. A new EventSource uses ?after=N from the contiguous cache prefix; missed events arrive without duplicate text |
| Identical Action retry | Resolve a form/plan/approval; Retry last Action | Same response outcome; authoritative lastSeq is unchanged; no second semantic result or mock operation |
| Conflicting choice | Send the saved choose_plan envelope with the other choiceId before another turn | 409; original choice, event log and locked card remain unchanged |
| Invalid input | Submit a blank custom plan through REST, an unknown candidate ID, or forged form fields | 422; pending interaction remains available; no accepted-action events |
| Pending-state recovery | Start a form/approval/decision; restart make dev; select saved run | waiting_input survives; user can resolve it. No suspended model/checkpoint is claimed |
| Execution recovery | Abrupt process termination during a running turn; restart against the same isolated DB | Startup appends run.interrupted; stored prefix remains readable. Graceful shutdown also drains workers |
| Read-only replay/history | Reset/Play or inspect an earlier turn | Action retry, stop and SSE exercise controls disabled; no business re-execution |

Stop acknowledges the actual saved terminal state. If normal completion wins the
race, the response can already be completed/failed instead of interrupted. Already
interrupted stops are idempotent; completed/failed/waiting_input runs return 409.
If the HTTP caller disconnects after cancellation is accepted, the worker still
finishes persistence; query the run or retry to learn the outcome.
Like all mutation endpoints, POST /stop requires Content-Type: application/json,
even though it has no request body; Host/Origin checks still apply.

Disconnect SSE closes only the live EventSource; REST reads and explicit mutations
still work. It is not a system-wide network outage simulator. Browser automatic
reconnection uses Last-Event-ID; manual reconnection constructs a new source and
therefore supplies the query cursor. The server prefers Last-Event-ID when both exist.
Never resume from the maximum cached seq if there is a gap.

Only submitted values are persisted. Unsubmitted form/custom drafts, connection state
and exercise retry receipts are local UI state, not replayed conversation output.
To inspect raw events use GET /api/runs/{id}/events?after=0 (pages of at most 1000),
then advance after to the last seq until exhausted.

## Reuse and verification

For a frontend integration, start with the generated REST types, Event envelope,
contiguous-prefix/deduplication helpers, chat reducer and controlled registry. Keep
business tools on the server. For a backend integration, copy one scenario's semantic
payloads, presentation mapping, allowlist, transaction and context policy together.
Replacing Mock should not change the frontend Action or A2UI contracts.

Run `make fmt`, `make test`, `make verify`. New P0 coverage is in
[resilience_test.go](../internal/modules/lab/resilience_test.go),
[use-events.test.tsx](../web/src/features/lab/use-events.test.tsx) and
[learning.spec.ts](../tests/e2e/learning.spec.ts). Existing interactive tests cover
concurrent duplicate submissions, invalid input, restart recovery and context filtering.
No credentials or external model are required; tests use isolated temporary databases.

P0 deliberately stops at deterministic interaction teaching. Actual model requests,
provider stream normalization and model/tool continuation belong to P1/P2; checkpoint
execution recovery belongs to the later real-Agent slice.
