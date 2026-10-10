import { describe, replay } from './a2ui'
import { orderedPrefix, type LabEvent } from './events'

export type ChatBlock =
  | { kind: 'markdown'; key: number; text: string; messageId: string }
  | { kind: 'surface'; key: number; surfaceId: string }

// Both channels reduce the same persisted prefix. A surface is anchored at its
// first component message; later updates keep that position and component identity.
export function chatView(input: LabEvent[]) {
  const events = orderedPrefix(input)
  const state = replay(events)
  const hybrid = events.some((e) => e.kind === 'run.started' && e.payload.rendering === 'hybrid')
  const blocks: ChatBlock[] = []
  const surfaces = new Set<string>()
  for (const e of events) {
    if (hybrid && e.kind === 'model.text_delta' && typeof e.payload.text === 'string') {
      const messageId = String(e.payload.messageId ?? 'answer')
      const last = blocks.at(-1)
      if (last?.kind === 'markdown' && last.messageId === messageId) last.text += e.payload.text
      else blocks.push({ kind: 'markdown', key: e.seq, text: e.payload.text, messageId })
    }
    if (e.kind === 'a2ui.message') {
      const info = describe(e.payload)
      if (info.type === 'deleteSurface') {
        surfaces.delete(info.surfaceId)
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i]
          if (b.kind === 'surface' && b.surfaceId === info.surfaceId) blocks.splice(i, 1)
        }
      }
      if (info.type === 'updateComponents' && !surfaces.has(info.surfaceId)) {
        surfaces.add(info.surfaceId)
        blocks.push({ kind: 'surface', key: e.seq, surfaceId: info.surfaceId })
      }
    }
  }
  return {
    state,
    blocks,
    user: events.find((e) => e.kind === 'user.message')?.payload.text,
    status: events.filter((e) => e.kind.startsWith('run.')).at(-1)?.kind,
  }
}
