import { describe, replay } from '@/lib/a2ui'
import { relativeTime, type LabEvent } from '@/lib/events'
export function Inspector({ event, events }: { event?: LabEvent; events: LabEvent[] }) {
  if (!event)
    return <p className="placeholder">Select a protocol event or timeline entry to inspect it.</p>
  const info = describe(event.payload),
    state = replay(events.filter((e) => e.seq <= event.seq)),
    issues = state.issues.filter((i) => i.seq === event.seq)
  return (
    <div className="inspector-detail">
      <dl>
        <dt>Sequence</dt>
        <dd>#{event.seq}</dd>
        <dt>Timestamp</dt>
        <dd>{event.timestamp}</dd>
        <dt>Relative time</dt>
        <dd>{relativeTime(event, events[0])} ms</dd>
        <dt>Kind</dt>
        <dd>{event.kind}</dd>
        {event.kind === 'a2ui.message' && (
          <>
            <dt>Protocol message</dt>
            <dd>{info.type}</dd>
            <dt>Surface</dt>
            <dd>{info.surfaceId}</dd>
            <dt>Components</dt>
            <dd>{info.componentCount}</dd>
            <dt>Validation</dt>
            <dd>
              {issues.length
                ? issues.map((i) => i.message).join('; ')
                : 'Valid · Lab catalog subset'}
            </dd>
          </>
        )}
        <dt>Payload bytes (UTF-8)</dt>
        <dd>{new TextEncoder().encode(JSON.stringify(event.payload)).length}</dd>
      </dl>
      <h3>Raw JSON</h3>
      <pre data-testid="raw-json">{JSON.stringify(event.payload, null, 2)}</pre>
      {event.kind === 'a2ui.message' && (
        <details>
          <summary>Parsed state after event</summary>
          <pre>{JSON.stringify(state.surfaces, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}
