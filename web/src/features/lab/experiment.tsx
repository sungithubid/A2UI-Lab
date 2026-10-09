import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, RotateCcw, StepForward, Radio } from 'lucide-react'
import { api, required } from '@/lib/api'
import { replay } from '@/lib/a2ui'
import type { Action } from '@/lib/events'
import { Button } from '@/components/ui/button'
import { Renderer } from '@/features/renderer/renderer'
import { ProtocolPanel } from '@/features/inspector/protocol-panel'
import { useEvents } from './use-events'
import { TimelineRow } from '@/features/timeline/timeline-row'
export function Experiment({ id }: { id: string }) {
  const client = useQueryClient(),
    query = useEvents(id),
    events = useMemo(() => query.data ?? [], [query.data]),
    [cursor, setCursor] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [selection, setSelection] = useState<number | null>(null),
    [category, setCategory] = useState('all')
  const visible = cursor === null ? events : events.slice(0, cursor)
  const state = useMemo(() => replay(events, cursor ?? events.length), [events, cursor])
  const selected =
    events.find((e) => e.seq === selection) ??
    visible.filter((e) => e.kind === 'a2ui.message').at(-1)
  const complete = events.some((e) =>
    [
      'run.completed',
      'run.failed',
      'run.interrupted',
      'run.waiting_input',
      'run.cancelled',
    ].includes(e.kind),
  )
  const waiting =
    events.filter((e) => e.kind.startsWith('run.')).at(-1)?.kind === 'run.waiting_input'
  const action = useMutation({
    mutationFn: async (body: Action) =>
      required((await api.POST('/api/runs/{id}/actions', { params: { path: { id } }, body })).data),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['events', id] })
      void client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setCursor((n) => Math.min((n ?? 0) + 1, events.length)), 180)
    return () => clearInterval(timer)
  }, [playing, events.length])
  const categories = ['all', ...new Set(events.map((e) => e.kind.split('.')[0]))]
  return (
    <>
      <div className="run-bar">
        <span>
          <Radio size={14} />{' '}
          {cursor === null
            ? waiting
              ? 'Waiting for your input'
              : query.connection
            : 'Replay · persisted events only'}
        </span>
        <span>
          {visible.length} / {events.length} events · {state.issues.length} validation issues
        </span>
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCursor(0)
              setPlaying(false)
              setSelection(null)
            }}
          >
            <RotateCcw />
            Reset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={cursor !== null && cursor >= events.length}
            onClick={() => {
              if (cursor === null) setCursor(0)
              setPlaying(!playing)
            }}
          >
            <Play />
            {playing && cursor !== events.length ? 'Pause' : 'Play'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={cursor !== null && cursor >= events.length}
            onClick={() => {
              setPlaying(false)
              setCursor((n) => Math.min((n ?? 0) + 1, events.length))
            }}
          >
            <StepForward />
            Step
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCursor(null)
              setPlaying(false)
            }}
          >
            Live
          </Button>
        </div>
      </div>
      {query.error && (
        <p role="alert" className="issue">
          {query.error.message}
        </p>
      )}
      {action.error && (
        <p role="alert" className="issue">
          {action.error.message}
        </p>
      )}
      <div className="lab-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>Agent / Input</h2>
            <span>SEMANTIC</span>
          </div>
          <div className="panel-scroll conversation">
            {visible
              .filter((e) =>
                ['user.message', 'model.text_delta', 'error.occurred'].includes(e.kind),
              )
              .map((e) => (
                <article
                  key={e.seq}
                  className={e.kind === 'user.message' ? 'user-bubble' : 'agent-bubble'}
                >
                  <small>
                    {e.kind === 'user.message'
                      ? 'You'
                      : e.kind === 'error.occurred'
                        ? 'Error'
                        : 'Mock Agent'}{' '}
                    · #{e.seq}
                  </small>
                  <p>{String(e.payload.text ?? e.payload.message ?? '')}</p>
                </article>
              ))}
            {!visible.length && <p className="placeholder">Waiting for events…</p>}
          </div>
        </section>
        <section className="panel renderer-panel">
          <div className="panel-title">
            <h2>Renderer</h2>
            <span>LIVE SURFACES</span>
          </div>
          <div className="panel-scroll">
            <Renderer
              state={state}
              runId={id}
              onAction={(a) => action.mutate(a)}
              disabled={cursor !== null || !complete || action.isPending}
            />
          </div>
        </section>
        <ProtocolPanel
          visible={visible}
          events={events}
          selected={selected}
          onSelect={setSelection}
        />
      </div>
      <section className="timeline">
        <div className="panel-title">
          <h2>Timeline / Events</h2>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="timeline-scroll">
          <table>
            <thead>
              <tr>
                <th>Seq</th>
                <th>Relative</th>
                <th>Category</th>
                <th>Event</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {visible
                .filter((e) => category === 'all' || e.kind.startsWith(category + '.'))
                .map((e) => (
                  <TimelineRow
                    key={e.seq}
                    event={e}
                    first={events[0]}
                    select={() => setSelection(e.seq)}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
