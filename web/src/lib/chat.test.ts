import { expect, it } from 'vitest'
import { chatView } from './chat'
import { VERSION, CATALOG } from './a2ui'
import type { LabEvent } from './events'

function event(seq: number, kind: string, payload: Record<string, unknown>): LabEvent {
  return { id: String(seq), runId: 'r', seq, kind, payload, timestamp: '2026-10-10T00:00:00Z' }
}
const sample = [
  event(1, 'run.started', { rendering: 'hybrid' }),
  event(2, 'user.message', { text: 'Analyze' }),
  event(3, 'model.text_delta', { messageId: 'a', text: '**Hello' }),
  event(4, 'model.text_delta', { messageId: 'a', text: ' world**' }),
  event(5, 'a2ui.message', {
    version: VERSION,
    createSurface: { surfaceId: 'main', catalogId: CATALOG },
  }),
  event(6, 'a2ui.message', {
    version: VERSION,
    updateComponents: {
      surfaceId: 'main',
      components: [{ id: 'root', component: 'Text', text: 'Card content' }],
    },
  }),
  event(7, 'model.text_delta', { messageId: 'a', text: 'After the card.' }),
]
it('interleaves streamed Markdown and stable surfaces in the recorded order', () => {
  const view = chatView(sample)
  expect(view.user).toBe('Analyze')
  expect(view.blocks.map((b) => b.kind)).toEqual(['markdown', 'surface', 'markdown'])
  expect(view.blocks[0]).toMatchObject({ key: 3, text: '**Hello world**' })
  expect(chatView(sample.slice(0, 4)).blocks).toHaveLength(1)
  expect(chatView([]).blocks).toEqual([])
  expect(chatView([sample[0], ...sample.slice(2)]).blocks).toEqual([])
  expect(chatView([...sample, sample[3]])).toEqual(view)
})
it('keeps legacy A2UI text without duplicating its semantic text deltas', () => {
  const legacy = [{ ...sample[0], payload: {} }, ...sample.slice(1)]
  expect(chatView(legacy).blocks.map((b) => b.kind)).toEqual(['surface'])
})
it('removes a deleted surface and preserves surrounding narrative', () => {
  const removed = chatView([
    ...sample,
    event(8, 'a2ui.message', { version: VERSION, deleteSurface: { surfaceId: 'main' } }),
  ])
  expect(removed.blocks.map((b) => b.kind)).toEqual(['markdown', 'markdown'])
  expect(removed.state.surfaces).toEqual({})
})
