import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Renderer, makeAction } from './renderer'
import { emptyState, applyMessage, VERSION, CATALOG } from '@/lib/a2ui'
import { Inspector } from '@/features/inspector/inspector'
it('renders a registry component and routes a normalized action', () => {
  let state = applyMessage(emptyState(), {
    version: VERSION,
    createSurface: { surfaceId: 'main', catalogId: CATALOG },
  })
  const node = {
    id: 'root',
    component: 'Button',
    child: 'label',
    action: { event: { name: 'view_errors', context: {} } },
  }
  state = applyMessage(state, {
    version: VERSION,
    updateComponents: {
      surfaceId: 'main',
      components: [node, { id: 'label', component: 'Text', text: 'View errors' }],
    },
  })
  const action = vi.fn()
  render(<Renderer state={state} runId="r" onAction={action} />)
  fireEvent.click(screen.getByRole('button', { name: 'View errors' }))
  expect(action).toHaveBeenCalledWith(makeAction('r', 'main', node))
})
it('survives unknown components and cyclic or missing references', () => {
  const state = {
    ...emptyState(),
    surfaces: {
      main: {
        data: {},
        components: {
          root: { id: 'root', component: 'Column', children: ['bad', 'root', 'missing'] },
          bad: { id: 'bad', component: 'FooChart' },
        },
      },
    },
  }
  render(<Renderer state={state} runId="r" onAction={() => {}} />)
  expect(screen.getByText('Unknown component: FooChart')).toBeInTheDocument()
  expect(screen.getByText(/Cyclic or too deep/)).toBeInTheDocument()
  expect(screen.getByText('Waiting for component: missing')).toBeInTheDocument()
})
it('inspects sequence, validation, raw payload and parsed state', () => {
  const event = {
    id: 'e',
    runId: 'r',
    seq: 1,
    kind: 'a2ui.message',
    timestamp: '2026-10-09T00:00:00Z',
    payload: { version: VERSION, createSurface: { surfaceId: 'main', catalogId: CATALOG } },
  }
  render(<Inspector event={event} events={[event]} />)
  expect(screen.getByText('#1')).toBeInTheDocument()
  expect(screen.getByText('Valid · Lab catalog subset')).toBeInTheDocument()
  expect(screen.getByTestId('raw-json')).toHaveTextContent('createSurface')
})
