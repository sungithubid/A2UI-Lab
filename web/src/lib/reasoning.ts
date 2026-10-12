import type { LabEvent } from './events'

export type ThinkingBlock = {
  kind: 'thinking'
  key: number
  messageId: string
  source: 'mock_summary' | 'provider_summary'
  text: string
  status: 'streaming' | 'completed' | 'interrupted' | 'failed' | 'incomplete'
  durationMs: number
}

// Input is the deduplicated, contiguous event prefix from chatView. Timing is
// derived from recorded timestamps, never a new wall-clock timer during replay.
export function reasoningView(events: LabEvent[]) {
  const blocks: ThinkingBlock[] = []
  const phases = new Map<string, { block: ThinkingBlock; start: LabEvent }>()
  const issues: { seq: number; message: string }[] = []
  const issue = (e: LabEvent, message: string) => issues.push({ seq: e.seq, message })
  for (const e of events) {
    for (const { block, start } of phases.values()) {
      if (block.status === 'streaming') {
        const duration = Date.parse(e.timestamp) - Date.parse(start.timestamp)
        block.durationMs = Number.isFinite(duration) ? Math.max(0, duration) : 0
      }
    }
    if (e.kind.startsWith('model.reasoning_')) {
      const id = e.payload.messageId
      if (typeof id !== 'string' || !id.trim()) {
        issue(e, 'Reasoning event needs a nonempty messageId.')
        continue
      }
      if (e.kind === 'model.reasoning_started') {
        const source = e.payload.source
        if (source !== 'mock_summary' && source !== 'provider_summary') {
          issue(e, 'Unknown reasoning source; expected a displayable summary.')
          continue
        }
        if (phases.has(id)) {
          issue(e, 'Duplicate reasoning phase ID; use a new ID for each phase.')
          continue
        }
        const block: ThinkingBlock = {
          kind: 'thinking',
          key: e.seq,
          messageId: id,
          source,
          text: '',
          status: 'streaming',
          durationMs: 0,
        }
        blocks.push(block)
        phases.set(id, { block, start: e })
      } else if (e.kind === 'model.reasoning_delta' || e.kind === 'model.reasoning_completed') {
        const phase = phases.get(id)
        if (!phase || phase.block.status !== 'streaming') {
          issue(e, 'Reasoning update has no active matching start event.')
          continue
        }
        if (e.kind === 'model.reasoning_delta') {
          if (typeof e.payload.text !== 'string') issue(e, 'Reasoning delta needs string text.')
          else phase.block.text += e.payload.text
        } else phase.block.status = 'completed'
      } else issue(e, 'Unknown reasoning event kind.')
    }
    const terminal = e.kind.startsWith('run.') && e.kind !== 'run.started'
    if (terminal || e.kind === 'error.occurred' || e.kind === 'model.response') {
      for (const { block } of phases.values()) {
        if (block.status !== 'streaming') continue
        const status = e.kind === 'model.response' ? e.payload.status : e.kind
        block.status =
          status === 'interrupted' || status === 'run.interrupted'
            ? 'interrupted'
            : status === 'failed' || status === 'run.failed' || e.kind === 'error.occurred'
              ? 'failed'
              : 'incomplete'
        if (block.status === 'incomplete')
          issue(e, 'Reasoning ended without a completion event; the saved summary is incomplete.')
      }
    }
  }
  return { blocks, issues }
}
