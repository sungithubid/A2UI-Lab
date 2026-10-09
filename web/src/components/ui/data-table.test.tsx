import { it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable } from './data-table'
it('sorts and paginates a full client dataset with accessible sort state', async () => {
  render(
    <DataTable
      columns={[{ accessorKey: 'name', header: 'Name' }]}
      data={[{ name: 'Zebra' }, { name: 'Apple' }, { name: 'Mango' }]}
      pageSize={2}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Name' }))
  expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending')
  expect(within(screen.getAllByRole('row')[1]).getByRole('cell')).toHaveTextContent('Apple')
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('cell')).toHaveTextContent('Zebra')
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})
