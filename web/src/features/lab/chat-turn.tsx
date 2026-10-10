import { memo, useMemo } from 'react'
import { Bot, UserRound } from 'lucide-react'
import type { LabEvent, Action } from '@/lib/events'
import { chatView } from '@/lib/chat'
import { Renderer } from '@/features/renderer/renderer'
import { Markdown } from './markdown'

export const ChatTurn = memo(function ChatTurn({
  events,
  runId,
  turnIndex,
  disabled,
  onAction,
}: {
  events: LabEvent[]
  runId: string
  turnIndex: number
  disabled: boolean
  onAction: (action: Action) => void
}) {
  const view = useMemo(() => chatView(events), [events])
  return (
    <section className="chat-turn" aria-label={`Turn ${turnIndex}`} data-run-id={runId}>
      <div className="turn-divider">TURN {turnIndex.toString().padStart(2, '0')}</div>
      {typeof view.user === 'string' && (
        <div className="chat-message from-user">
          <div className="chat-avatar">
            <UserRound size={15} />
          </div>
          <article className="chat-bubble user-bubble">
            <small>You</small>
            <p>{view.user}</p>
          </article>
        </div>
      )}
      {view.blocks.length > 0 && (
        <div className="chat-message from-agent">
          <div className="chat-avatar">
            <Bot size={15} />
          </div>
          <article className="chat-bubble agent-bubble">
            <small>
              Agent <span>MOCK</span>
            </small>
            {view.blocks.map((b) =>
              b.kind === 'markdown' ? (
                <Markdown key={b.key} text={b.text} />
              ) : (
                view.state.surfaces[b.surfaceId] && (
                  <Renderer
                    key={b.key}
                    state={{
                      surfaces: { [b.surfaceId]: view.state.surfaces[b.surfaceId] },
                      issues: [],
                    }}
                    runId={runId}
                    onAction={onAction}
                    disabled={disabled}
                  />
                )
              ),
            )}
            {view.status === 'run.started' && <span className="streaming-label">Streaming…</span>}
          </article>
        </div>
      )}
      {!view.blocks.length && (
        <p className="placeholder">UI appears here as protocol messages arrive.</p>
      )}
      {view.state.issues.map((issue, i) => (
        <p role="alert" className="issue" key={i}>
          #{issue.seq} · {issue.message}
        </p>
      ))}
      {['run.failed', 'run.interrupted'].includes(view.status ?? '') && (
        <p role="status" className="issue">
          {view.status === 'run.failed'
            ? 'This turn failed. Its partial output is preserved.'
            : 'This turn was interrupted. Its partial output is preserved.'}
        </p>
      )}
    </section>
  )
})
