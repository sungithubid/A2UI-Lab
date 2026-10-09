import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
// With serverPage, sorting covers the supplied page only. For global sorting,
// fetch sorted data on the server instead of passing a partial dataset here.
export function DataTable<T>({
  columns,
  data,
  pageSize = 10,
  serverPage,
}: {
  columns: ColumnDef<T>[]
  data: T[]
  pageSize?: number
  serverPage?: { page: number; total: number; onPageChange: (page: number) => void }
}) {
  const { t } = useTranslation()
  const [sorting, setSorting] = useState<SortingState>([])
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      ...(serverPage ? { pagination: { pageIndex: serverPage.page - 1, pageSize } } : {}),
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: !!serverPage,
    rowCount: serverPage?.total,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  })
  const page = serverPage?.page ?? table.getState().pagination.pageIndex + 1
  const count = Math.max(1, table.getPageCount())
  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getCanSort()
                        ? header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ArrowUp size={14} />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ArrowDown size={14} />
                        ) : (
                          <ArrowUpDown size={14} />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t('No results.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanPreviousPage()}
          onClick={() => (serverPage ? serverPage.onPageChange(page - 1) : table.previousPage())}
        >
          {t('Previous')}
        </Button>
        <span className="text-xs">{t('Page {{page}} of {{count}}', { page, count })}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={!table.getCanNextPage()}
          onClick={() => (serverPage ? serverPage.onPageChange(page + 1) : table.nextPage())}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
