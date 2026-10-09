import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { object, type Node } from '@/lib/a2ui'
import { safeImage, safeLink, type Field } from '@/lib/interactive'
export type InteractiveProps = {
  node: Node
  disabled: boolean
  action: (node: Node, data?: Record<string, unknown>) => void
}
export function ImageCard({ node }: InteractiveProps) {
  const value = object(node.value) ? node.value : {}
  const [failed, setFailed] = useState(false)
  if (!safeLink(value.url) || !safeImage(value.image))
    return <p role="alert">Invalid image card URL</p>
  return (
    <a
      className={`resource-card ${value.layout === 'row' ? 'resource-row' : ''}`}
      href={value.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="resource-thumbnail">
        {failed ? (
          <span>Image unavailable</span>
        ) : (
          <img
            src={value.image}
            alt={String(value.alt)}
            onError={() => setFailed(true)}
            loading="lazy"
          />
        )}
      </div>
      <div className="resource-copy">
        <h3>{String(value.title)}</h3>
        <p>{String(value.description)}</p>
        <span>
          Read documentation ↗ <span className="sr-only">(opens in a new tab)</span>
        </span>
      </div>
    </a>
  )
}
export function FormCard({ node, disabled, action }: InteractiveProps) {
  const value = object(node.value) ? node.value : {},
    fields = value.fields as Field[],
    prefix = useId()
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        f.name,
        object(value.values) && typeof value.values[f.name] === 'string'
          ? String(value.values[f.name])
          : f.type === 'select'
            ? (f.options?.[0] ?? '')
            : '',
      ]),
    ),
  )
  const locked = disabled || node.disabled === true
  return (
    <form
      className="render-card lab-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!locked) action(node, draft)
      }}
    >
      <h3>{String(value.title)}</h3>
      <p className="form-description">{String(value.description)}</p>
      <fieldset disabled={locked}>
        {fields.map((field) => {
          const id = prefix + '-' + field.name,
            props = {
              id,
              name: field.name,
              required: field.required,
              value: draft[field.name] ?? '',
              onChange: (
                e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
              ) => setDraft((previous) => ({ ...previous, [field.name]: e.target.value })),
            }
          return (
            <div className="form-field" key={field.name}>
              <label htmlFor={id}>
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              {field.type === 'select' ? (
                <select {...props}>
                  {field.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea {...props} maxLength={field.maxLength} rows={3} />
              ) : (
                <input {...props} type={field.type} maxLength={field.maxLength} />
              )}
            </div>
          )
        })}
        <Button type="submit" disabled={locked}>
          {node.disabled ? 'Ticket submitted' : 'Submit ticket'}
        </Button>
      </fieldset>
    </form>
  )
}
export function ApprovalCard({ node, disabled, action }: InteractiveProps) {
  const value = object(node.value) ? node.value : {},
    locked = disabled || node.disabled === true
  return (
    <section className="render-card approval-card" aria-label="Deployment approval">
      <p className="eyebrow">HUMAN CONFIRMATION · MOCK</p>
      <h3>{String(value.title)}</h3>
      <p>{String(value.description)}</p>
      {typeof value.service === 'string' && (
        <dl>
          <dt>Service</dt>
          <dd>{String(value.service)}</dd>
          <dt>Environment</dt>
          <dd>{String(value.environment)}</dd>
          <dt>Operation</dt>
          <dd>{String(value.operation)}</dd>
        </dl>
      )}
      {node.disabled ? (
        <p role="status" className="decision-receipt">
          Decision: {String(value.decision)}
        </p>
      ) : (
        <div className="approval-actions">
          <Button disabled={locked} onClick={() => action(node, { decision: 'approve' })}>
            Approve deployment
          </Button>
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => action(node, { decision: 'reject' })}
          >
            Reject deployment
          </Button>
        </div>
      )}
    </section>
  )
}
