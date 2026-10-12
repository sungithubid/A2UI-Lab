# ADR 0013: optional displayable thinking summaries

## Context

The chat laboratory needs a thinking-output interaction that can later consume real
model output while preserving the existing narrative/A2UI boundaries. A displayable
summary is distinct from private model state, final answer text and conversation memory.

## Decision

Add an optional deepThinking boolean to Create and the application Agent request,
defaulting to false. Persist it in the exact request snapshot and run.started metadata.
Mock emits fixed source-labelled reasoning start/delta/completed events when enabled.
Provider summaries may later normalize to this same semantic lifecycle.

Reuse the streaming buffer keyed by event kind/message ID, flushing at channel switches,
lifecycle transitions and termination. Presentation emits thinking models; A2UI emits
no protocol messages for them. A pure frontend reducer positions phases in the common
event prefix and diagnoses invalid sources/lifecycle. Missing completion is incomplete,
not completed. Separate reasoning/answer character metrics remain explicitly non-token.

Provide generation switches for new/follow-up requests and local per-turn visibility/
expansion controls. Default live expansion becomes automatic collapse on completion,
unless manually overridden. Durations use persisted timestamps. Trace uses the same
reasoning reducer to describe the saved content/status.

## Consequences

Reasoning is locally persisted and replayable but excluded from subsequent messages
and UI facts. Changing the option does not mutate earlier runs. Historical records
without the flag remain compatible; no schema migration or provider dependency is added.
The Chat Completions messages preview stays unchanged and does not invent provider
reasoning options. Only actual displayable provider output may use provider_summary;
opaque continuation state belongs to a later adapter runtime, not this visible channel.
