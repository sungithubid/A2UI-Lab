import { describe, it, expect } from 'vitest'
import { applyMessage, emptyState, replay, VERSION, CATALOG } from './a2ui'
import { mergeEvents, orderedPrefix, type LabEvent } from './events'
const create = { version: VERSION, createSurface: { surfaceId: 'main', catalogId: CATALOG } }
const update = {
  version: VERSION,
  updateComponents: {
    surfaceId: 'main',
    components: [{ id: 'root', component: 'Text', text: { path: '/text' } }],
  },
}
const data = {
  version: VERSION,
  updateDataModel: { surfaceId: 'main', path: '/', value: { text: 'hello' } },
}
function event(seq: number, payload: Record<string, unknown>): LabEvent {
  return {
    id: String(seq),
    runId: 'r',
    seq,
    kind: 'a2ui.message',
    timestamp: '2026-10-09T00:00:00Z',
    payload,
  }
}
describe('deterministic protocol reducer', () => {
  it('replays identical state and supports reset/step', () => {
    const events = [event(1, create), event(2, update), event(3, data)]
    expect(replay(events)).toEqual(replay(structuredClone(events)))
    expect(replay(events, 0)).toEqual(emptyState())
    expect(replay(events, 1).surfaces.main.components).toEqual({})
    expect(replay(events, 3).surfaces.main.data).toEqual({ text: 'hello' })
  })
  it('deduplicates, reorders, and waits for missing events', () => {
    const events = mergeEvents([event(3, data)], [event(1, create), event(1, create)])
    expect(events.map((e) => e.seq)).toEqual([1, 3])
    expect(orderedPrefix(events)).toHaveLength(1)
    expect(replay(mergeEvents(events, [event(2, update)]))).toEqual(
      replay([event(1, create), event(2, update), event(3, data)]),
    )
  })
  it('rejects malformed envelopes, catalog, missing surfaces and unsafe identifiers without mutation', () => {
    for (const value of [
      null,
      {},
      update,
      { ...create, version: 'v1.0' },
      { ...create, deleteSurface: { surfaceId: 'main' } },
      { version: VERSION, createSurface: { surfaceId: '__proto__', catalogId: CATALOG } },
    ]) {
      const state = emptyState(),
        next = applyMessage(state, value, 4)
      expect(next.issues).toHaveLength(1)
      expect(state).toEqual(emptyState())
      expect(next.surfaces).toEqual({})
    }
  })
  it('handles unknown types, malformed components, duplicate surfaces and deletion', () => {
    const initial = applyMessage(emptyState(), create)
    expect(applyMessage(initial, create).issues[0].message).toContain('already exists')
    expect(
      applyMessage(initial, {
        version: VERSION,
        updateComponents: {
          surfaceId: 'main',
          components: [{ id: 'root', component: 'FooChart' }],
        },
      }).issues[0].message,
    ).toContain('Unknown component')
    expect(
      applyMessage(initial, {
        version: VERSION,
        updateComponents: {
          surfaceId: 'main',
          components: [{ id: 'root', component: 'Column', children: 3 }],
        },
      }).issues,
    ).toHaveLength(1)
    expect(
      applyMessage(initial, { version: VERSION, deleteSurface: { surfaceId: 'main' } }).surfaces,
    ).toEqual({})
  })
})
