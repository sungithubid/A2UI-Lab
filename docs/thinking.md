# Optional thinking summaries

[English](thinking.md) | [简体中文](thinking_zh.md)

Deep thinking is a per-request, application-owned option. In this slice it enables
a fixed Mock planning summary before the ordinary answer in any of the nine scenarios.
It does not call a model, expose private model internals or estimate reasoning tokens.

![Thinking summary, generation switch and recorded Trace](images/thinking-summary.png)

## Page interaction

- **Deep thinking** beside New run enables/disables summary output for the new run.
- The same option in the chat composer controls the next turn. Changing it does not
  modify an already running turn or earlier history. The shared preference defaults
  to Off on page load; every submitted turn records its own value.
- During summary streaming, a Thinking panel opens by default with an activity icon,
  source badge and elapsed time. On completion it collapses automatically unless the
  user explicitly chose an expanded/collapsed state. The button supports keyboard use.
- **Show thinking** in each Agent bubble hides/shows its panels without changing the
  answer or deleting events. Expansion/visibility preferences are local UI state.
- Stopped or failed summaries keep their saved text and show the corresponding state.
  A missing completion on a normally finished run shows Thinking incomplete and a
  diagnostic; it is never silently presented as a completed thought.
- Trace has a Thinking span with the recorded source, content and status. Learning lab
  also offers reasoning event checkpoints. Reload/replay restore the persisted prefix.

## Request contract

```json
{
  "prompt": "Analyze server health",
  "scenarioId": "server-health",
  "deepThinking": true
}
```

POST /api/runs also accepts conversationId and parentRunId for continuation.
deepThinking is optional and defaults to false. It is copied into agent.Request,
the exact model.request snapshot, and run.started metadata. The client cannot
toggle a submitted request retroactively. Old events are not rewritten.

Trace's OpenAI-compatible messages preview remains display-only and contains messages
alone. Inspect Mock runtime / original snapshot for deepThinking; no vendor-specific
reasoning parameter is fabricated from this application option.

## Semantic events and mapping

```json
[
  {"kind":"model.reasoning_started","payload":{"messageId":"thinking-1","source":"mock_summary"}},
  {"kind":"model.reasoning_delta","payload":{"messageId":"thinking-1","text":"A displayable summary fragment."}},
  {"kind":"model.reasoning_completed","payload":{"messageId":"thinking-1"}}
]
```

These are semantic payload examples, not complete persisted Event envelopes. Persistence
adds runId, id, seq and timestamp. Each phase has a unique run-local messageId.
Sources are mock_summary or provider_summary; the latter is a prepared normalization
boundary, not an implemented provider adapter.

| Layer | Responsibility |
| --- | --- |
| Agent | Honor the option and emit a displayable summary lifecycle separately from model.text_delta |
| Service | Coalesce reasoning and answer deltas by kind + messageId; flush on channel/ID changes, lifecycle events and termination |
| Presentation | Map to thinking-start / thinking-delta / thinking-end; remain independent of A2UI |
| A2UI | Create no Surface/component for these models |
| Chat reducer | Place phases in event order, deduplicate via the contiguous prefix, validate lifecycle and source, preserve partial text |
| Thinking component | Safe Markdown, expansion, local visibility, recorded duration and reduced-motion behavior |
| Context builder | Use answer text and allowed business facts; exclude reasoning summaries |

The first fragment of each channel/message is immediate; remaining deltas use the
existing 50 ms / 128-character buffer. Switching channels flushes before the next
event, so a pending thought cannot be appended to the answer. model.response records
outputCharacters for answers and reasoningCharacters separately; neither is a token
count. Displayed duration comes from saved timestamps and freezes at completion or
termination, including during replay.

## Preparing a real adapter

1. Treat deepThinking as a request for supported displayable reasoning output.
   Map it to provider-specific options only inside the adapter, after checking the
   chosen model's documented capability. It is not a universal API field.
2. Emit provider_summary only for content the provider actually makes available for
   display. Do not invent a summary or ask for private chain-of-thought to fill the UI.
   A model may reason internally while returning no displayable summary.
3. Normalize a supported streaming summary into start/delta/completed events. A final
   summary can use the same lifecycle with one delta. Use fresh IDs for subsequent
   phases around tool calls; keep ordinary answer text on model.text_delta.
4. Mark completion only when the upstream phase finishes. Cancellation/error keeps
   the received prefix; the frontend derives interrupted/failed states from the log.
5. Keep provider continuation/checkpoint state separate from visible summaries. If a
   vendor requires opaque state to continue, preserve it inside the adapter's future
   runtime boundary rather than appending displayed summaries to chat messages.

The existing safe Markdown renderer also applies here: no incoming HTML/code execution,
unsafe links or embedded remote images. Summaries are persisted locally and inspectable;
excluding them from future messages does not delete them or provide general PII redaction.

## Code and verification

- [Semantic payloads](../internal/event/event.go), [Mock summaries](../internal/agent/mock/reasoning.go)
- [Buffering and persistence](../internal/modules/lab/service.go), [Context policy](../internal/modules/lab/context.go)
- [Pure reasoning reducer](../web/src/lib/reasoning.ts), [Thinking interaction](../web/src/features/lab/thinking.tsx)
- [Backend tests](../internal/modules/lab/reasoning_test.go), [Reducer tests](../web/src/lib/reasoning.test.ts),
  [Component tests](../web/src/features/lab/thinking.test.tsx), [Browser tests](../tests/e2e/thinking.spec.ts)
- [ADR 0013](decisions/0013-optional-thinking-summaries.md)

Run make fmt, make test and make verify. Coverage includes enabled/disabled output for
all scenarios, buffer preservation on stop, separate character accounting, context
exclusion, interleaved phases, malformed/lifecycle diagnostics, keyboard interaction,
reload/replay, per-turn options and mobile layout. No migrations or credentials are needed.
