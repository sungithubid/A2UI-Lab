import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ImageCard, FormCard, ApprovalCard } from './interactive'
import { interactiveError } from '@/lib/interactive'
import { applyMessage, emptyState, replay, VERSION, CATALOG, type Node } from '@/lib/a2ui'
const action = { event: { name: 'submit_ticket', context: {} } }
const form: Node = {
  id: 'ticket-form',
  component: 'LabForm',
  action,
  value: {
    title: 'Support',
    description: 'Demo',
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true, maxLength: 254 }],
    values: { email: 'saved@example.test' },
  },
}
it('keeps form values and submits them as action data', () => {
  const submit = vi.fn()
  render(<FormCard node={form} disabled={false} action={submit} />)
  expect(screen.getByLabelText('Email *')).toHaveValue('saved@example.test')
  fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'edited@example.test' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Submit ticket' }).closest('form')!)
  expect(submit).toHaveBeenCalledWith(form, { email: 'edited@example.test' })
})
it('blocks form submission during replay or after completion', () => {
  const submit = vi.fn()
  render(<FormCard node={{ ...form, disabled: true }} disabled={false} action={submit} />)
  expect(screen.getByLabelText('Email *')).toBeDisabled()
  fireEvent.submit(screen.getByRole('button', { name: 'Ticket submitted' }).closest('form')!)
  expect(submit).not.toHaveBeenCalled()
})
it('provides explicit approve and reject actions', () => {
  const submit = vi.fn(),
    node = {
      id: 'approval',
      component: 'LabApproval',
      value: { title: 'Deploy?', description: 'Demo' },
      action,
    }
  render(<ApprovalCard node={node} disabled={false} action={submit} />)
  fireEvent.click(screen.getByRole('button', { name: 'Reject deployment' }))
  expect(submit).toHaveBeenCalledWith(node, { decision: 'reject' })
  fireEvent.click(screen.getByRole('button', { name: 'Approve deployment' }))
  expect(submit).toHaveBeenCalledWith(node, { decision: 'approve' })
})
it('renders image links with safe new-tab behavior and an image fallback', () => {
  const node = {
    id: 'image',
    component: 'LabImageCard',
    value: {
      title: 'A2UI',
      description: 'Docs',
      image: '/scenario-images/protocol.svg',
      url: 'https://a2ui.org/',
      alt: 'Protocol illustration',
      layout: 'row',
    },
  }
  render(<ImageCard node={node} disabled={false} action={() => {}} />)
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByText('Image unavailable')).toBeInTheDocument()
})
it('rejects malformed and unsafe interactive payloads', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//evil.test',
    'https://user:pass@example.com',
  ])
    expect(
      interactiveError({
        id: 'x',
        component: 'LabImageCard',
        value: {
          title: 'x',
          description: 'x',
          image: '/scenario-images/protocol.svg',
          alt: 'x',
          url,
        },
      }),
    ).toBeDefined()
  expect(
    interactiveError({
      ...form,
      value: {
        title: 'x',
        description: 'x',
        fields: [{ name: '__proto__', label: 'x', type: 'text', required: true, maxLength: 3 }],
      },
    }),
  ).toBeDefined()
})
it('replays the submitted form as a disabled snapshot with persisted values', () => {
  const payloads = [
    { version: VERSION, createSurface: { surfaceId: 'main', catalogId: CATALOG } },
    {
      version: VERSION,
      updateComponents: { surfaceId: 'main', components: [{ ...form, id: 'root' }] },
    },
    {
      version: VERSION,
      updateComponents: {
        surfaceId: 'main',
        components: [{ ...form, id: 'root', disabled: true }],
      },
    },
  ]
  const events = payloads.map((payload, i) => ({
    id: String(i),
    seq: i + 1,
    runId: 'r',
    kind: 'a2ui.message',
    timestamp: '2026-10-09T00:00:00Z',
    payload,
  }))
  expect(replay(events)).toEqual(
    payloads.reduce((s, p, i) => applyMessage(s, p, i + 1), emptyState()),
  )
  expect(replay(events).surfaces.main.components.root.disabled).toBe(true)
  expect(replay(events, 2).surfaces.main.components.root.disabled).toBeUndefined()
})
