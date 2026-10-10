# 0010: Chat Completions messages in the request trace

Status: accepted.

## Decision

Default the Agent request trace to a deterministic, read-only messages projection
matching the role/content text format of [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
Keep runtime settings and the exact original snapshot under a separate disclosure.
This changes the inspector view, not the Agent boundary or persisted event format.
No external API is called. A model is required for a real Chat Completions request;
leave it and sampling parameters absent instead of inventing configuration for Mock.

Append allowlisted UI context to its corresponding assistant content as labeled data.
Preserve message order, do not duplicate the current prompt, and strip source IDs
from message fields. Never elevate historical facts into privileged instructions
or synthesize tool messages without matching calls. Invalid/unmatched context has
an explicit diagnostic rather than an apparently complete but truncated preview.

## Consequences

Existing saved runs gain the preview without migrations or event rewrites. Debuggers
can still compare the exact persisted Mock input. Context limits continue to apply
to the original backend request; this display projection is not a new model adapter.
A future provider adapter must define and record its actual HTTP request separately.
