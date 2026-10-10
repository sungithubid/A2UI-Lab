import { useEffect, useMemo, useState, useRef } from 'react'
import { useMutation, useQueryClient, useQuery, useQueries } from '@tanstack/react-query'
import { Play, RotateCcw, StepForward, Radio } from 'lucide-react'
import { api, required } from '@/lib/api'
import { replay } from '@/lib/a2ui'
import type { Action } from '@/lib/events'
import { Button } from '@/components/ui/button'
import { ChatTurn } from './chat-turn'
import { TracePanel } from './trace-panel'
import { orderedPrefix } from '@/lib/events'
import type { components } from '@/generated/api'
import { ProtocolPanel } from '@/features/inspector/protocol-panel'
import { fetchEvents, useEvents } from './use-events'
import { TimelineRow } from '@/features/timeline/timeline-row'
export function Experiment({ id, onRun }: { id: string; onRun: (id: string) => void }) {
  const client = useQueryClient(),
    query = useEvents(id),
    events = useMemo(() => query.data ?? [], [query.data]),
    [cursor, setCursor] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [selection, setSelection] = useState<number | null>(null),
    [category, setCategory] = useState('all')
  const visible = orderedPrefix(cursor === null ? events : events.slice(0, cursor))
  const state = useMemo(() => replay(events, cursor ?? events.length), [events, cursor])
  const selected =
    visible.find((e) => e.seq === selection) ??
    visible.filter((e) => e.kind === 'a2ui.message').at(-1)
  const status = events.filter((e) => e.kind.startsWith('run.')).at(-1)?.kind
  const complete = status !== undefined && status !== 'run.started'
  const waiting = status === 'run.waiting_input'
  const [draft, setDraft] = useState('')
  const [nextScenario, setNextScenario] =
    useState<components['schemas']['Create']['scenarioId']>('streaming-text')
  const scroll = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const conversation = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () =>
      required((await api.GET('/api/runs/{id}/conversation', { params: { path: { id } } })).data)
        .items,
  })
  const run = conversation.data?.find((r) => r.id === id)
  const latest = conversation.data?.at(-1)
  const earlier = (conversation.data ?? []).filter((r) => r.turnIndex < (run?.turnIndex ?? 0))
  const history = useQueries({
    queries: earlier.map((r) => ({
      queryKey: ['events', r.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchEvents(r.id, signal),
      staleTime: Infinity,
    })),
  })
  const scenarios = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => required((await api.GET('/api/scenarios')).data).items,
  })
  const send = useMutation({
    mutationFn: async () =>
      required(
        (
          await api.POST('/api/runs', {
            body: {
              prompt: draft,
              scenarioId: nextScenario,
              conversationId: run!.conversationId,
              parentRunId: id,
            },
          })
        ).data,
      ),
    onSuccess: (r) => {
      setDraft('')
      void client.invalidateQueries({ queryKey: ['runs'] })
      onRun(r.id)
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['conversation', id] })
    },
  })
  const canContinue =
    cursor === null && complete && !waiting && latest?.id === id && !send.isPending
  const historySizes = history.map((q) => q.data?.length ?? 0).join(',')
  useEffect(() => {
    if (scroll.current && follow.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [visible.length, historySizes])
  const action = useMutation({
    mutationFn: async (body: Action) =>
      required((await api.POST('/api/runs/{id}/actions', { params: { path: { id } }, body })).data),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['events', id] })
      void client.invalidateQueries({ queryKey: ['runs'] })
      void client.invalidateQueries({ queryKey: ['conversation', id] })
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
        <TracePanel events={visible} run={run} turns={conversation.data ?? []} onRun={onRun} />
        <section className="panel renderer-panel chat-panel">
          <div className="panel-title">
            <h2>Conversation</h2>
            <span>MARKDOWN + A2UI</span>
          </div>
          <div className="chat-context-bar">
            <span>Conversation {run?.conversationId.slice(0, 8) ?? '…'}</span>
            <span>
              Turn {run?.turnIndex ?? 1} · {cursor === null ? 'Live' : 'Replay'}
            </span>
          </div>
          <div
            className="panel-scroll chat-scroll"
            ref={scroll}
            onScroll={(e) => {
              const el = e.currentTarget
              follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
            }}
          >
            {conversation.isPending && <p className="placeholder">Loading conversation…</p>}
            {conversation.error && <p role="alert">{conversation.error.message}</p>}
            {earlier.map((r, i) => (
              <div key={r.id}>
                {history[i].isPending && <p className="placeholder">Loading turn {r.turnIndex}…</p>}
                {history[i].error && <p role="alert">{history[i].error.message}</p>}
                {history[i].data && (
                  <ChatTurn
                    events={history[i].data}
                    runId={r.id}
                    turnIndex={r.turnIndex}
                    disabled
                    onAction={() => {}}
                  />
                )}
                <button className="inspect-turn" onClick={() => onRun(r.id)}>
                  Inspect turn {r.turnIndex}
                </button>
              </div>
            ))}
            <ChatTurn
              events={visible}
              runId={id}
              turnIndex={run?.turnIndex ?? 1}
              onAction={(a) => action.mutate(a)}
              disabled={cursor !== null || !complete || action.isPending || latest?.id !== id}
            />
          </div>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault()
              if (canContinue && !action.isPending && draft.trim()) send.mutate()
            }}
          >
            {latest && latest.id !== id ? (
              <button type="button" className="inspect-turn" onClick={() => onRun(latest.id)}>
                Return to latest turn to continue →
              </button>
            ) : (
              <>
                <label className="sr-only" htmlFor="follow-up">
                  Follow-up message
                </label>
                <textarea
                  id="follow-up"
                  placeholder="Continue this conversation…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  disabled={!canContinue || action.isPending}
                  required
                />
                <div className="composer-actions">
                  <label>
                    Next scenario
                    <select
                      aria-label="Next scenario"
                      value={nextScenario}
                      disabled={!canContinue}
                      onChange={(e) => setNextScenario(e.target.value as typeof nextScenario)}
                    >
                      {scenarios.data?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="submit"
                    disabled={!canContinue || action.isPending || !draft.trim()}
                  >
                    {send.isPending ? 'Sending…' : 'Send message'}
                  </Button>
                </div>
                <p className="composer-hint">
                  {cursor !== null
                    ? 'Replay is read-only. Choose Live to continue.'
                    : waiting
                      ? 'Submit the form or resolve the decision before continuing.'
                      : !complete
                        ? 'The Agent is responding…'
                        : 'Mock uses saved history. Choose a scenario for the next turn.'}
                </p>
              </>
            )}
            {send.error && (
              <p role="alert" className="issue">
                {send.error.message}
              </p>
            )}
          </form>
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
