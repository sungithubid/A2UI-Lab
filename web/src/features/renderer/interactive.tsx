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

export function ChoiceCard({ node, disabled, action }: InteractiveProps) {
  const value = object(node.value) ? node.value : {}
  const options = value.options as import('@/lib/interactive').ChoiceOption[]
  const selected = typeof value.selectedChoiceId === 'string' ? value.selectedChoiceId : ''
  const [draft, setDraft] = useState(typeof value.customText === 'string' ? value.customText : '')
  const inputId = useId()
  const locked = disabled || node.disabled === true
  return (
    <section className="render-card choice-card" aria-label="Plan decision">
      <p className="eyebrow">PLAN DECISION · MOCK</p>
      <h3>{String(value.title)}</h3>
      <p className="form-description">{String(value.description)}</p>
      <div className="choice-options">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className={`choice-option ${selected === option.id ? 'choice-selected' : ''}`}
            disabled={locked}
            aria-pressed={selected === option.id}
            onClick={() => {
              if (!locked) action(node, { choiceId: option.id })
            }}
          >
            <span className="choice-number">{index + 1}</span>
            <span className="choice-copy">
              <span className="choice-title">
                {option.title}
                {option.recommended && <span className="choice-recommended">Recommended</span>}
              </span>
              <span className="choice-description">{option.description}</span>
            </span>
            {selected === option.id && <span className="choice-check">✓ Confirmed</span>}
          </button>
        ))}
        {value.allowCustom === true && (
          <form
            className={`choice-option choice-custom-option ${selected === 'custom' ? 'choice-selected' : ''}`}
            onSubmit={(e) => {
              e.preventDefault()
              if (!locked && draft.trim()) action(node, { choiceId: 'custom', text: draft.trim() })
            }}
          >
            <span className="choice-number">{options.length + 1}</span>
            <div className="choice-copy">
              <div className="choice-title">
                <label htmlFor={inputId}>Custom plan</label>
                {selected === 'custom' && <span className="choice-check">✓ Confirmed</span>}
              </div>
              <textarea
                id={inputId}
                value={node.disabled ? String(value.customText ?? '') : draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={Number(value.customMaxLength)}
                required
                disabled={locked}
                placeholder="Enter your plan or idea here…"
              />
              {!node.disabled && (
                <div className="choice-custom-actions">
                  <span>Up to {Number(value.customMaxLength)} characters</span>
                  <Button type="submit" size="sm" disabled={locked || !draft.trim()}>
                    Confirm custom plan
                  </Button>
                </div>
              )}
            </div>
          </form>
        )}
      </div>
      {node.disabled ? (
        <p role="status" className="decision-receipt">
          {'Confirmed: '}
          {selected === 'custom'
            ? 'Custom plan'
            : options.find((option) => option.id === selected)?.title}
        </p>
      ) : (
        <p className="choice-hint">Click a plan to confirm, or enter and submit your own.</p>
      )}
    </section>
  )
}
