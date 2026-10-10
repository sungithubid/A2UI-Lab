import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, required } from '@/lib/api'
import { mergeEvents, type LabEvent } from '@/lib/events'
import { object } from '@/lib/a2ui'
export async function fetchEvents(id: string, signal?: AbortSignal): Promise<LabEvent[]> {
  const events: LabEvent[] = []
  let after = 0
  for (;;) {
    const items = required(
      (
        await api.GET('/api/runs/{id}/events', {
          params: { path: { id }, query: { after } },
          signal,
        })
      ).data,
    ).items
    events.push(...items)
    if (items.length < 1000) return events
    after = items[items.length - 1].seq
  }
}
export function useEvents(id: string) {
  const client = useQueryClient(),
    [connection, setConnection] = useState('Connecting')
  const query = useQuery({
    queryKey: ['events', id],
    queryFn: async ({ signal }) => {
      const items = await fetchEvents(id, signal)
      return mergeEvents(client.getQueryData<LabEvent[]>(['events', id]) ?? [], items)
    },
  })
  useEffect(() => {
    const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/stream`)
    source.onopen = () => setConnection('Live')
    source.onerror = () => setConnection('Reconnecting · stored events are safe')
    const listener = (incoming: MessageEvent) => {
      try {
        const e: unknown = JSON.parse(incoming.data)
        if (
          !object(e) ||
          e.runId !== id ||
          typeof e.seq !== 'number' ||
          !Number.isSafeInteger(e.seq) ||
          e.seq < 1 ||
          typeof e.kind !== 'string' ||
          typeof e.timestamp !== 'string' ||
          typeof e.id !== 'string' ||
          !object(e.payload)
        )
          throw new Error('Invalid event envelope')
        client.setQueryData<LabEvent[]>(['events', id], (previous) =>
          mergeEvents(previous ?? [], [e as LabEvent]),
        )
        if (e.kind.startsWith('run.') && e.kind !== 'run.started')
          void client.invalidateQueries({ queryKey: ['runs'] })
      } catch {
        setConnection('Invalid stream event received')
      }
    }
    source.addEventListener('lab', listener)
    return () => source.close()
  }, [id, client])
  return { ...query, connection }
}
