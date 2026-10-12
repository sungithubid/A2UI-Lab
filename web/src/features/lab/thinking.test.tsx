import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { Thinking } from './thinking'
import type { ThinkingBlock } from '@/lib/reasoning'

const block: ThinkingBlock = {
  kind: 'thinking',
  key: 1,
  messageId: 't',
  source: 'mock_summary',
  text: 'A **summary**.',
  status: 'streaming',
  durationMs: 400,
}
it('opens while streaming, collapses on completion and supports keyboard expansion', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Thinking block={block} />)
  expect(screen.getByRole('button', { name: /Thinking…/ })).toHaveAttribute('aria-expanded', 'true')
  expect(
    screen.getByText('A fixed Mock planning summary. No external model was called.'),
  ).toBeVisible()
  rerender(<Thinking block={{ ...block, status: 'completed', durationMs: 700 }} />)
  const button = screen.getByRole('button', { name: /Thinking complete/ })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  button.focus()
  await user.keyboard('{Enter}')
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('summary', { exact: true })).toBeVisible()
})

it('keeps a manual collapse during deltas and completion and renders partial terminal states', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<Thinking block={block} />)
  await user.click(screen.getByRole('button', { name: /Thinking…/ }))
  rerender(<Thinking block={{ ...block, text: block.text + ' More text.', durationMs: 800 }} />)
  expect(screen.getByRole('button', { name: /Thinking…/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  rerender(<Thinking block={{ ...block, status: 'interrupted' }} />)
  const button = screen.getByRole('button', { name: /Thinking interrupted/ })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  await user.click(button)
  expect(screen.getByText('summary', { exact: true })).toBeVisible()
})
