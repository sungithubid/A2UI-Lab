import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NoteForm } from './note-form'
describe('NoteForm', () => {
  it('rejects whitespace titles before saving', async () => {
    const save = vi.fn()
    render(<NoteForm onSave={save} onCancel={vi.fn()} pending={false} error={null} />)
    await userEvent.type(screen.getByLabelText('Title'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give your note a title')
    expect(save).not.toHaveBeenCalled()
  })
  it('edits existing content and trims title', async () => {
    const save = vi.fn()
    render(
      <NoteForm
        initial={{ title: 'Original', content: 'Remember this' }}
        onSave={save}
        onCancel={vi.fn()}
        pending={false}
        error={null}
      />,
    )
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), '  Updated  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }))
    expect(save).toHaveBeenCalledWith(
      { title: 'Updated', content: 'Remember this' },
      expect.anything(),
    )
  })
  it('keeps entered content on server errors and prevents duplicate saves', () => {
    render(
      <NoteForm
        initial={{ title: 'My idea', content: 'Draft' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        pending
        error={new Error('Connection lost')}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to connect. Please try again.')
    expect(screen.getByLabelText('Content')).toHaveValue('Draft')
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })
})
