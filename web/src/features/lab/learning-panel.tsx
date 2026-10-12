import { useMutation } from '@tanstack/react-query'
import { api, required } from '@/lib/api'
import type { Action, LabEvent } from '@/lib/events'
import type { components } from '@/generated/api'
import { Button } from '@/components/ui/button'

type Guide = { output: string; events: string[]; action: string; context: string }
const guides: Record<components['schemas']['Create']['scenarioId'], Guide> = {
  'streaming-text': {
    output: 'Text deltas become Markdown. No A2UI surface is created.',
    events: ['model.text_delta', 'presentation.event', 'run.completed'],
    action: 'No Action. Try stopping a new run while text is arriving.',
    context: 'The saved narrative and user prompt enter the next turn.',
  },
  'server-health': {
    output: 'Tool and progress events create a surface; the status card binds /summary.',
    events: [
      'tool.started',
      'tool.completed',
      'a2ui.message',
      'action.received',
      'action.completed',
    ],
    action: 'View errors → view_errors. Retry the recorded Action after it completes.',
    context: 'Narrative, tool result and action outcome become semantic history.',
  },
  'tool-error': {
    output: 'A failed mock tool becomes an alert and a failed run.',
    events: ['tool.started', 'error.occurred', 'run.failed'],
    action: 'No Action. Replay the same failure without executing a tool.',
    context: 'The error fact and partial narrative enter the next turn.',
  },
  'stream-error': {
    output: 'Partial Markdown is saved before an upstream error becomes an alert.',
    events: ['model.text_delta', 'error.occurred', 'a2ui.message', 'run.failed'],
    action: 'No Action. Reset and Step to see the text before the failure.',
    context: 'Partial narrative, failed status and the error fact enter the next turn.',
  },
  'image-card': {
    output: 'A resource fact becomes a linked image card beside Markdown.',
    events: ['resource.recommended', 'presentation.event', 'a2ui.message'],
    action: 'The safe external link opens in the browser; it does not call the Action API.',
    context: 'The resource fact enters history; the component tree does not.',
  },
  'image-list': {
    output: 'Each result appends a row card to the same surface.',
    events: ['resource.found', 'presentation.event', 'a2ui.message'],
    action: 'Links are browser navigation. Disconnect SSE and reconnect to catch up.',
    context: 'Resource facts enter history in their recorded order.',
  },
  'support-form': {
    output: 'A field schema becomes a form; the run waits without an active worker.',
    events: [
      'input.required',
      'run.waiting_input',
      'action.received',
      'ticket.created',
      'run.completed',
    ],
    action:
      'Submit ticket → submit_ticket. The server validates all fields; identical retries add no events.',
    context:
      'The ticket outcome enters history. Submitted contact fields stay out of model context.',
  },
  'deployment-approval': {
    output: 'A persisted approval becomes Approve / Reject controls.',
    events: ['approval.required', 'run.waiting_input', 'approval.resolved', 'action.completed'],
    action:
      'decide_deployment → completed or cancelled. Approval executes only a local mock operation.',
    context: 'The decision and simulated outcome enter history; replay never deploys.',
  },
  'plan-decision': {
    output: 'Candidate definitions become selectable plans and an inline custom input.',
    events: [
      'decision.required',
      'run.waiting_input',
      'action.received',
      'decision.resolved',
      'run.completed',
    ],
    action:
      'choose_plan validates persisted candidate IDs. Retry the same choice; a different choice is rejected.',
    context: 'The confirmed choice, including submitted custom text, enters history.',
  },
}

export function LearningPanel({
  id,
  scenario,
  events,
  readOnly,
  connected,
  onConnection,
  onInspect,
}: {
  id: string
  scenario?: string
  events: LabEvent[]
  readOnly: boolean
  connected: boolean
  onConnection: (connected: boolean) => void
  onInspect: (seq: number) => void
}) {
  const guide = guides[scenario as keyof typeof guides]
  const lastAction = events.find((e) => e.kind === 'action.received')
  const retry = useMutation({
    mutationFn: async () => {
      const before = required((await api.GET('/api/runs/{id}', { params: { path: { id } } })).data)
      const after = required(
        (
          await api.POST('/api/runs/{id}/actions', {
            params: { path: { id } },
            body: lastAction!.payload as Action,
          })
        ).data,
      )
      return { before: before.lastSeq, after: after.lastSeq }
    },
  })
  return (
    <details className="learning-panel">
      <summary>Learning lab · event flow & resilience exercises</summary>
      <div className="learning-content">
        <p>
          Saved request → semantic events → presentation → Markdown / A2UI → Action → next-turn
          context
        </p>
        {guide ? (
          <>
            <p>{guide.output}</p>
            <div className="learning-events" aria-label="Scenario event checkpoints">
              {['model.request', ...guide.events].map((kind) => {
                const event = events.find((e) => e.kind === kind)
                return (
                  <Button
                    key={kind}
                    size="sm"
                    variant="outline"
                    disabled={!event}
                    onClick={() => event && onInspect(event.seq)}
                  >
                    {kind}
                  </Button>
                )
              })}
            </div>
            <p>
              <strong>Interaction:</strong> {guide.action}
            </p>
            <p>
              <strong>Next-turn context:</strong> {guide.context} Send a follow-up and inspect Build
              context and Agent request in Trace.
            </p>
          </>
        ) : (
          <p>This saved scenario has no teaching recipe. Its events are still inspectable.</p>
        )}
        <div className="learning-exercises">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConnection(!connected)}
            disabled={readOnly}
          >
            {connected ? 'Disconnect SSE' : 'Reconnect SSE'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || !lastAction || retry.isPending}
            onClick={() => retry.mutate()}
          >
            {retry.isPending ? 'Retrying…' : 'Retry last Action'}
          </Button>
        </div>
        <p className="learning-hint">
          Disconnecting SSE closes delivery only. The Agent keeps running; reconnect resumes from
          the contiguous saved cursor. Stop run cancels execution. Retry sends the exact recorded
          Action, including its data.
        </p>
        {retry.data && (
          <p role="status">
            {retry.data.before === retry.data.after
              ? `Retry accepted · event sequence unchanged (#${retry.data.after}).`
              : `Event sequence changed: #${retry.data.before} → #${retry.data.after}. Inspect the stored events.`}
          </p>
        )}
        {retry.error && (
          <p role="alert" className="issue">
            {retry.error.message}
          </p>
        )}
        <p className="learning-hint">
          Code path: internal/agent/mock → internal/presentation → internal/a2ui →
          web/src/features/renderer. Actions: internal/action; history:
          internal/modules/lab/context.go. All operations in these examples are local Mock fixtures.
        </p>
      </div>
    </details>
  )
}
