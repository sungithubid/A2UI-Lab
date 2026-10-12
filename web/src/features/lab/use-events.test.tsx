import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useEvents } from './use-events'
import type { LabEvent } from '@/lib/events'

vi.mock('@/lib/api', () => ({
  api: { GET: vi.fn(async () => ({ data: { items: [] } })) },
  required: (data: unknown) => data,
}))

class Source {
  static instances: Source[] = []
  onopen?: () => void
  onerror?: () => void
  listener?: (message: MessageEvent) => void
  closed = false
  constructor(public url: string) {
    Source.instances.push(this)
  }
  addEventListener(_type: string, listener: (message: MessageEvent) => void) {
    this.listener = listener
  }
  close() {
    this.closed = true
  }
  emit(seq: number, runId = 'run') {
    this.listener?.(
      new MessageEvent('lab', {
        data: JSON.stringify({
          id: String(seq),
          runId,
          seq,
          kind: 'model.text_delta',
          timestamp: '2026-10-12T00:00:00Z',
          payload: { text: String(seq) },
        }),
      }),
    )
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  Source.instances = []
})

it('disconnects delivery and reconnects from the contiguous cursor without duplicating events', async () => {
  vi.stubGlobal('EventSource', Source)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, rerender, unmount } = renderHook(({ connected }) => useEvents('run', connected), {
    initialProps: { connected: true },
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  const first = Source.instances[0]
  expect(first.url.endsWith('/stream?after=0')).toBe(true)
  act(() => {
    first.onopen?.()
    first.emit(1)
    first.emit(3)
    first.emit(1)
  })
  expect(result.current.data?.map((e) => e.seq)).toEqual([1, 3])
  rerender({ connected: false })
  expect(first.closed).toBe(true)
  expect(result.current.connection).toContain('Agent keeps running')
  rerender({ connected: true })
  const second = Source.instances[1]
  expect(second.url.endsWith('/stream?after=1')).toBe(true)
  act(() => {
    second.emit(2)
    second.emit(3)
    second.emit(4, 'other-run')
  })
  expect((result.current.data as LabEvent[]).map((e) => e.seq)).toEqual([1, 2, 3])
  expect(result.current.connection).toBe('Invalid stream event received')
  unmount()
  expect(second.closed).toBe(true)
  client.clear()
})
