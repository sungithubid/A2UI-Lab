import type { components } from '@/generated/api'
export type LabEvent = components['schemas']['Event']
export type Run = components['schemas']['Run']
export type Action = components['schemas']['Envelope']
export function mergeEvents(previous: LabEvent[], incoming: LabEvent[]): LabEvent[] {
  const bySeq = new Map(previous.map((e) => [e.seq, e]))
  for (const e of incoming) if (!bySeq.has(e.seq)) bySeq.set(e.seq, e)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}
// Only apply a contiguous prefix; a missing sequence must be fetched before later UI updates.
export function orderedPrefix(events: LabEvent[]): LabEvent[] {
  const out: LabEvent[] = []
  for (const e of mergeEvents([], events)) {
    if (e.seq !== out.length + 1) break
    out.push(e)
  }
  return out
}
export function relativeTime(event: LabEvent, first?: LabEvent): number {
  return first ? Math.max(0, Date.parse(event.timestamp) - Date.parse(first.timestamp)) : 0
}
