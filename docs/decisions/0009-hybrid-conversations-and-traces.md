# 0009: Hybrid conversation rendering and local request traces

Status: accepted.

## Decision

Keep the pure-Go binary, SQLite event log, resumable SSE and application-owned Agent
boundary. Extend runs into ordered turns within persisted conversations. Use
Markdown text deltas for narrative and A2UI surfaces for structured/interactive UI,
rendered in the same Agent bubble. A shared sequence remains the source for replay.
Do not send cumulative narrative through repeated component/data-model snapshots.

The backend is authoritative for history. It constructs a bounded request from
recent messages and deterministic semantic UI facts. Whole-turn omission is explicit;
we do not add an LLM summarizer or copy full UI trees. Client requests contain the
new prompt, scenario and conversation/parent references. Serialize continuation and
require the latest non-running, non-waiting parent to prevent ambiguous branching.

Save the exact application request passed to the Mock adapter and measured output
metadata. A local span viewer exposes context, request, tools, actions and protocol
output without a Langfuse service, fabricated provider parameters, token usage or
costs. Mock follow-ups quote received context using a deterministic template. Real
LLM integration remains a separate, explicitly configured adapter.

## Consequences

Migration 00004 preserves existing runs as separate conversations. New turns share a
conversation ID but scope surfaces to their own run. Limit conversations to 100 turns
and model requests to eight prior whole turns / 32,000 serialized UTF-8 bytes. These
are explicit initial limits, not token estimates. Historical request snapshots are
immutable even when an earlier run is deleted. Bulk deletion clears all history.

Earlier-turn actions become read-only. Forms/approvals must be resolved before a new
turn; this slice does not implement parallel branches or later-turn resolution of
older pending forms. Draft inputs remain client-local. Contact form values are
excluded from model context, but ordinary prompt text and local event history are
not a general-purpose PII-sanitized store.

The Markdown dependency supplies parsing/GFM instead of an ad hoc parser. Raw HTML
and remote Markdown images are disabled; URLs are filtered. A2UI remains validated
through its existing catalog. Old stored protocol-text runs use their legacy render
path. Replay consumes recorded coalesced deltas and never invokes timers or Agent
execution to reconstruct content.
