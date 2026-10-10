import { expect, it } from 'vitest'
import { chatRequestPreview } from './chat-request'

it('projects ordered messages and UI facts without duplicating prompt or leaking runtime fields', () => {
  const input = {
    adapter: 'mock',
    externalCall: false,
    textBuffer: { maxWaitMs: 50 },
    request: {
      prompt: 'What next?',
      scenarioId: 'streaming-text',
      messages: [
        { role: 'system', content: 'Instructions' },
        { role: 'user', content: 'Check health', sourceRunId: 'r1' },
        { role: 'assistant', content: 'Healthy.', sourceRunId: 'r1' },
        { role: 'user', content: 'What next?' },
      ],
      uiContext: [
        {
          runId: 'r1',
          scenarioId: 'server-health',
          status: 'completed',
          facts: ['cpu: 32', 'errors: 3'],
        },
      ],
    },
  }
  const before = structuredClone(input)
  const preview = chatRequestPreview(input)
  expect(preview.error).toBeUndefined()
  expect(preview.request?.messages).toHaveLength(4)
  expect(preview.request?.messages.map((m) => m.role)).toEqual([
    'system',
    'user',
    'assistant',
    'user',
  ])
  expect(preview.request?.messages[0]).toEqual({ role: 'system', content: 'Instructions' })
  expect(preview.request?.messages[2].content).toContain('Healthy.\n\n[Recorded UI context')
  expect(preview.request?.messages[2].content).toContain('cpu: 32')
  expect(preview.request?.messages[3]).toEqual({ role: 'user', content: 'What next?' })
  for (const key of ['sourceRunId', 'textBuffer', 'prompt', 'adapter', 'externalCall', 'uiContext'])
    expect(JSON.stringify(preview.request)).not.toContain(`"${key}":`)
  expect(input).toEqual(before)
})

it('keeps the first-turn messages exactly as entered, including Chinese and newlines', () => {
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: '你是谁？\n请介绍自己。' },
  ]
  expect(
    chatRequestPreview({ request: { prompt: '你是谁？\n请介绍自己。', messages, uiContext: [] } }),
  ).toEqual({ request: { messages } })
})

it('reports malformed or unmatched saved context instead of silently losing it', () => {
  for (const request of [
    null,
    { messages: [] },
    { messages: [{ role: 'unknown', content: 'text' }] },
    { messages: [{ role: ['user'], content: 'text' }] },
    { messages: [{ role: 'user', content: {} }] },
    { messages: [{ role: 'user', content: 'text' }], uiContext: {} },
    { messages: [{ role: 'user', content: 'text' }], uiContext: [null] },
    {
      messages: [{ role: 'user', content: 'text' }],
      uiContext: [
        { runId: 'missing', scenarioId: 'server-health', status: 'completed', facts: [] },
      ],
    },
  ]) {
    expect(chatRequestPreview({ request }).error).toBeTruthy()
    expect(chatRequestPreview({ request }).request).toBeUndefined()
  }
})
