import { expect, it } from 'vitest'
import { chatView } from './chat'
import type { LabEvent } from './events'

function event(seq: number, kind: string, payload: Record<string, unknown> = {}): LabEvent {
  return {
    id: String(seq),
    runId: 'r',
    seq,
    kind,
    payload,
    timestamp: new Date(seq * 100).toISOString(),
  }
}
const sample = [
  event(1, 'run.started', { rendering: 'hybrid', deepThinking: true }),
  event(2, 'user.message', { text: 'Analyze' }),
  event(3, 'model.reasoning_started', { messageId: 't', source: 'mock_summary' }),
  event(4, 'model.reasoning_delta', { messageId: 't', text: 'Compare ' }),
  event(5, 'model.reasoning_delta', { messageId: 't', text: '**options**.' }),
  event(6, 'model.reasoning_completed', { messageId: 't' }),
  event(7, 'model.text_delta', { messageId: 'a', text: 'Final answer.' }),
  event(8, 'run.completed'),
]

it('reduces thinking separately from the answer, with recorded timing and no surfaces', () => {
  const view = chatView(sample)
  expect(view.deepThinking).toBe(true)
  expect(view.blocks).toEqual([
    {
      kind: 'thinking',
      key: 3,
      messageId: 't',
      source: 'mock_summary',
      text: 'Compare **options**.',
      status: 'completed',
      durationMs: 300,
    },
    { kind: 'markdown', key: 7, messageId: 'a', text: 'Final answer.' },
  ])
  expect(view.state.surfaces).toEqual({})
  expect(view.state.issues).toEqual([])
  expect(chatView(sample.slice(0, 5)).blocks[0]).toMatchObject({
    status: 'streaming',
    text: 'Compare **options**.',
    durationMs: 200,
  })
  expect(chatView([...sample, sample[4], sample[5]])).toEqual(view)
  expect(chatView([sample[0], ...sample.slice(2)]).blocks).toEqual([])
})

it('keeps interleaved reasoning phases in order without merging them into Markdown', () => {
  const view = chatView([
    ...sample.slice(0, 7),
    event(8, 'model.reasoning_started', { messageId: 't2', source: 'provider_summary' }),
    event(9, 'model.reasoning_delta', { messageId: 't2', text: 'Check the tool result.' }),
    event(10, 'model.reasoning_completed', { messageId: 't2' }),
    event(11, 'model.text_delta', { messageId: 'a', text: 'Updated answer.' }),
  ])
  expect(view.blocks.map((b) => b.kind)).toEqual(['thinking', 'markdown', 'thinking', 'markdown'])
  expect(view.blocks[2]).toMatchObject({
    source: 'provider_summary',
    text: 'Check the tool result.',
    status: 'completed',
  })
})

it('preserves unfinished thinking for interruption/failure and diagnoses missing completion', () => {
  for (const status of ['interrupted', 'failed', 'completed', 'waiting_input']) {
    const view = chatView([...sample.slice(0, 5), event(6, `run.${status}`)])
    expect(view.blocks[0]).toMatchObject({
      status: ['interrupted', 'failed'].includes(status) ? status : 'incomplete',
      text: 'Compare **options**.',
      durationMs: 300,
    })
    expect(view.state.issues.length).toBe(['interrupted', 'failed'].includes(status) ? 0 : 1)
  }
})

it('contains malformed, unknown and out-of-lifecycle reasoning with explicit diagnostics', () => {
  const invalid = chatView([
    sample[0],
    event(2, 'model.reasoning_started', { messageId: 'bad', source: 'private_hidden_state' }),
    event(3, 'model.reasoning_delta', { messageId: 'missing', text: 'No start' }),
    event(4, 'model.reasoning_started', { messageId: 't', source: 'mock_summary' }),
    event(5, 'model.reasoning_delta', { messageId: 't', text: 42 }),
    event(6, 'model.reasoning_delta', { text: 'No ID' }),
    event(7, 'model.reasoning_unknown', { messageId: 't' }),
    event(8, 'model.reasoning_started', { messageId: 't', source: 'mock_summary' }),
    event(9, 'model.reasoning_completed', { messageId: 't' }),
    event(10, 'model.reasoning_delta', { messageId: 't', text: 'Too late' }),
  ])
  expect(invalid.state.issues).toHaveLength(7)
  expect(invalid.blocks).toHaveLength(1)
  expect(invalid.blocks[0]).toMatchObject({ status: 'completed', text: '' })
})
