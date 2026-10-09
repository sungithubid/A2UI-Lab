import { relativeTime, type LabEvent } from '@/lib/events'
export function TimelineRow({
  event: e,
  first,
  select,
}: {
  event: LabEvent
  first?: LabEvent
  select: () => void
}) {
  return (
    <tr>
      <td>#{e.seq}</td>
      <td>{relativeTime(e, first)} ms</td>
      <td>
        <span className="category">{e.kind.split('.')[0]}</span>
      </td>
      <td>
        <button onClick={select}>{e.kind}</button>
      </td>
      <td className="payload-preview">{JSON.stringify(e.payload)}</td>
    </tr>
  )
}
