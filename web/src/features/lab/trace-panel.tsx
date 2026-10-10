import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import { object } from '@/lib/a2ui'
import { relativeTime, type LabEvent, type Run } from '@/lib/events'

type Span = {
  id: string
  name: string
  depth: number
  start: LabEvent
  end?: LabEvent
  input: unknown
  output?: unknown
}
export function TracePanel({
  events,
  run,
  turns,
  onRun,
}: {
  events: LabEvent[]
  run?: Run
  turns: Run[]
  onRun: (id: string) => void
}) {
  const [selection, setSelection] = useState('model')
  const first = events[0]
  const latest = events.at(-1)
  const modelEnd =
    events.find((e) => e.kind === 'model.response') ??
    events.find((e) => e.kind === 'run.interrupted' || e.kind === 'run.failed')
  const spans: Span[] = []
  if (first)
    spans.push({
      id: 'run',
      name: 'Run',
      depth: 0,
      start: first,
      end: events.filter((e) => e.kind.startsWith('run.') && e.kind !== 'run.started').at(-1),
      input: {
        runId: run?.id,
        conversationId: run?.conversationId,
        turnIndex: run?.turnIndex,
        scenarioId: run?.scenarioId,
      },
      output: latest?.payload,
    })
  for (const e of events) {
    if (e.kind === 'trace.context')
      spans.push({
        id: 'context',
        name: 'Build context',
        depth: 1,
        start: e,
        end: e,
        input: e.payload,
        output: e.payload.context,
      })
    if (e.kind === 'model.request')
      spans.push({
        id: 'model',
        name: 'Agent request · Mock',
        depth: 1,
        start: e,
        end: modelEnd,
        input: e.payload,
        output: modelEnd ? { event: modelEnd.kind, ...modelEnd.payload } : undefined,
      })
    if (e.kind === 'tool.started') {
      const end =
        events.find(
          (v) =>
            v.seq > e.seq && v.kind === 'tool.completed' && v.payload.callId === e.payload.callId,
        ) ??
        events.find(
          (v) =>
            v.seq > e.seq && ['error.occurred', 'run.failed', 'run.interrupted'].includes(v.kind),
        )
      spans.push({
        id: `tool-${e.seq}`,
        name: `Tool · ${String(e.payload.name)}`,
        depth: 2,
        start: e,
        end,
        input: e.payload,
        output: end?.payload,
      })
    }
    if (e.kind === 'action.received')
      spans.push({
        id: `action-${e.seq}`,
        name: `Action · ${String(e.payload.action)}`,
        depth: 1,
        start: e,
        end: events.find((v) => v.seq > e.seq && v.kind === 'action.completed'),
        input: e.payload,
        output: events.find((v) => v.seq > e.seq && v.kind === 'action.completed')?.payload,
      })
  }
  const protocol = events.filter((e) => e.kind === 'a2ui.message')
  if (protocol.length)
    spans.push({
      id: 'ui',
      name: `A2UI · ${protocol.length} messages`,
      depth: 1,
      start: protocol[0],
      end: protocol.at(-1),
      input: { channel: 'a2ui.message', firstSeq: protocol[0].seq },
      output: {
        lastSeq: protocol.at(-1)?.seq,
        note: 'Select a message in Protocol Inspector for its complete payload.',
      },
    })
  const selected = spans.find((s) => s.id === selection) ?? spans[0]
  const total = Math.max(1, latest && first ? relativeTime(latest, first) : 1)
  return (
    <section className="panel trace-panel">
      <div className="panel-title">
        <h2>Trace</h2>
        <GitBranch size={16} />
      </div>
      {run && (
        <label className="trace-turn-picker">
          Inspect turn
          <select aria-label="Trace turn" value={run.id} onChange={(e) => onRun(e.target.value)}>
            {turns.map((turn) => (
              <option key={turn.id} value={turn.id}>
                #{turn.turnIndex} · {turn.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="trace-notice">
        LOCAL TRACE · MOCK
        <br />
        <span>No external LLM call. Token usage and cost are unavailable.</span>
      </div>
      <div className="trace-tree" aria-label="Execution spans">
        {spans.map((s) => {
          const duration =
            s.id === 'context'
              ? Number(s.start.payload.durationMs ?? 0)
              : s.end
                ? relativeTime(s.end, s.start)
                : Math.max(0, latest ? relativeTime(latest, s.start) : 0)
          return (
            <button
              key={s.id}
              className={selected?.id === s.id ? 'selected' : ''}
              style={{ paddingLeft: 12 + s.depth * 12 }}
              onClick={() => setSelection(s.id)}
              aria-pressed={selected?.id === s.id}
            >
              <span>{s.name}</span>
              <small>
                {duration} ms{s.end ? '' : ' · running'}
              </small>
              <span className="trace-track">
                <i
                  style={{
                    marginLeft: `${Math.min(98, (relativeTime(s.start, first) * 100) / total)}%`,
                    width: `${Math.max(2, (duration * 100) / total)}%`,
                  }}
                />
              </span>
            </button>
          )
        })}
        {!spans.length && <p className="placeholder">Trace appears as events arrive.</p>}
      </div>
      <div className="trace-detail">
        <h3>{selected?.name ?? 'Trace details'}</h3>
        {selected && (
          <>
            <p className="trace-caption">
              #{selected.start.seq}
              {selected.end && ` → #${selected.end.seq}`} ·{' '}
              {selected.end ? 'Recorded' : 'In progress'}
            </p>
            <h4>{selected.id === 'model' ? 'Request parameters' : 'Input'}</h4>
            <pre data-testid="trace-input">{JSON.stringify(selected.input, null, 2)}</pre>
            {selected.id === 'model' && object(selected.input) && (
              <p className="trace-caption">
                Exact application request passed to the Mock adapter. This is not an LLM HTTP
                payload.
              </p>
            )}
            <h4>Output / status</h4>
            <pre data-testid="trace-output">
              {JSON.stringify(selected.output ?? { status: 'pending' }, null, 2)}
            </pre>
          </>
        )}
      </div>
    </section>
  )
}
