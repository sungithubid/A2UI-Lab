import { ImageCard, FormCard, ApprovalCard } from './interactive'
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { object, type Node, type Surface, type ProtocolState } from '@/lib/a2ui'
import type { Action } from '@/lib/events'
type Props = {
  node: Node
  surface: Surface
  child: (id: string) => ReactNode
  action: (node: Node, data?: Record<string, unknown>) => void
  disabled: boolean
}
const text = (n: Node, s: Surface) =>
  typeof n.text === 'string'
    ? n.text
    : object(n.text) && typeof n.text.path === 'string'
      ? String(s.data[n.text.path.slice(1)] ?? `[Missing binding: ${n.text.path}]`)
      : ''
export const registry: Record<string, (p: Props) => ReactNode> = {
  LabImageCard: ImageCard,
  LabForm: FormCard,
  LabApproval: ApprovalCard,
  Text: ({ node, surface }) => <p className="render-text">{text(node, surface)}</p>,
  Column: ({ node, child }) => (
    <div className="render-column">
      {(node.children as string[]).map((id) => (
        <div key={id}>{child(id)}</div>
      ))}
    </div>
  ),
  Row: ({ node, child }) => (
    <div className="render-row">
      {(node.children as string[]).map((id) => (
        <div key={id}>{child(id)}</div>
      ))}
    </div>
  ),
  Card: ({ node, child }) => <div className="render-card">{child(node.child as string)}</div>,
  Button: ({ node, child, action, disabled }) => (
    <Button disabled={disabled} onClick={() => action(node)}>
      {child(node.child as string)}
    </Button>
  ),
  LabProgress: ({ node, surface }) => (
    <div className="render-card">
      <p>
        {text(node, surface)} · {Number(node.percent)}%
      </p>
      <progress aria-label={text(node, surface)} value={Number(node.percent)} max={100} />
    </div>
  ),
  LabToolCall: ({ node, surface }) => (
    <details className="render-card">
      <summary>Tool call · {text(node, surface)}</summary>
      <pre>{JSON.stringify(node.value, null, 2)}</pre>
    </details>
  ),
  LabToolResult: ({ node, surface }) => (
    <details className="render-card" open>
      <summary>Tool result · {text(node, surface)}</summary>
      <pre>{JSON.stringify(node.value, null, 2)}</pre>
    </details>
  ),
  LabAlert: ({ node, surface }) => (
    <p role="alert" className="issue">
      {text(node, surface)}
    </p>
  ),
}
export function makeAction(
  runId: string,
  surfaceId: string,
  node: Node,
  data?: Record<string, unknown>,
): Action {
  const event = object(node.action) && object(node.action.event) ? node.action.event : {}
  return {
    version: 1,
    runId,
    surfaceId,
    componentId: node.id,
    category: 'tool',
    action: String(event.name ?? ''),
    data: data ?? (object(event.context) ? event.context : {}),
  }
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p role="alert">Renderer error. Inspect the incoming event.</p>
    ) : (
      this.props.children
    )
  }
}
export function Renderer({
  state,
  runId,
  onAction,
  disabled = false,
}: {
  state: ProtocolState
  runId: string
  onAction: (action: Action) => void
  disabled?: boolean
}) {
  return (
    <>
      {Object.entries(state.surfaces).map(([surfaceId, surface]) => {
        function render(id: string, path: string[] = []): ReactNode {
          if (path.includes(id) || path.length > 30)
            return <p role="alert">Cyclic or too deep component reference: {id}</p>
          const node = surface.components[id]
          if (!node) return <p className="placeholder">Waiting for component: {id}</p>
          const View = registry[node.component]
          if (!View)
            return (
              <details className="issue" open>
                <summary>Unknown component: {node.component}</summary>
                <pre>{JSON.stringify(node, null, 2)}</pre>
              </details>
            )
          return (
            <View
              node={node}
              surface={surface}
              disabled={disabled}
              child={(next) => render(next, [...path, id])}
              action={(n, data) => onAction(makeAction(runId, surfaceId, n, data))}
            />
          )
        }
        return (
          <section className="surface" key={surfaceId}>
            <p className="eyebrow">SURFACE / {surfaceId}</p>
            <Boundary key={JSON.stringify(surface)}>{render('root')}</Boundary>
          </section>
        )
      })}
      {state.issues.map((issue, i) => (
        <p role="alert" className="issue" key={i}>
          #{issue.seq} · {issue.message}
        </p>
      ))}
      {!Object.keys(state.surfaces).length && (
        <p className="placeholder">UI appears here as protocol messages arrive.</p>
      )}
    </>
  )
}
