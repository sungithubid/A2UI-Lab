import { memo, useMemo, useState } from 'react'
import { Bot, UserRound } from 'lucide-react'
import type { LabEvent, Action } from '@/lib/events'
import { chatView } from '@/lib/chat'
import { Renderer } from '@/features/renderer/renderer'
import { Markdown } from './markdown'
import { Thinking } from './thinking'

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
  const [showThinking, setShowThinking] = useState(true)
  const hasThinking = view.blocks.some((b) => b.kind === 'thinking')
  return (
    <section className="chat-turn" aria-label={`Turn ${turnIndex}`} data-run-id={runId}>
      <div className="turn-divider">TURN {turnIndex.toString().padStart(2, '0')}</div>
      {typeof view.user === 'string' && (
        <div className="chat-message from-user">
          <div className="chat-avatar">
            <UserRound size={15} />
          </div>
          <article className="chat-bubble user-bubble">
            <small>
              You {view.deepThinking && <span className="turn-mode">Deep thinking</span>}
            </small>
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
            {hasThinking && (
              <label className="thinking-visibility">
                <input
                  type="checkbox"
                  checked={showThinking}
                  onChange={(e) => setShowThinking(e.target.checked)}
                  aria-label={`Show thinking for turn ${turnIndex}`}
                />
                Show thinking
              </label>
            )}
            {view.blocks.map((b) =>
              b.kind === 'thinking' ? (
                showThinking && <Thinking key={b.key} block={b} />
              ) : b.kind === 'markdown' ? (
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
            {view.status === 'run.started' && (
              <span className="streaming-label">
                {hasThinking && !showThinking
                  ? 'Thinking hidden · Agent is responding…'
                  : 'Streaming…'}
              </span>
            )}
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
