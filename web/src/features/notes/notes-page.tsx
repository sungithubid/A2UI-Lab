import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, FileText, Plus, MoreHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'
import type { components } from '@/generated/api'
import { api, required, errorMessage } from '@/lib/api'
import { useWorkspace } from '@/features/workspaces/context'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/ui/confirm'
import { ErrorState, Loading } from '@/components/states'
import { NoteForm } from './note-form'
import { notesQuery } from './queries'
function Editor({
  id,
  close,
  restoreFocus,
}: {
  id: string
  close: () => void
  restoreFocus: () => void
}) {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['note', workspace.id, id],
    enabled: id !== 'new',
    queryFn: async () =>
      required(
        (
          await api.GET('/api/workspaces/{workspaceID}/notes/{id}', {
            params: { path: { workspaceID: workspace.id, id } },
          })
        ).data,
      ),
  })
  const save = useMutation({
    mutationFn: async (body: components['schemas']['Write']) =>
      id === 'new'
        ? api.POST('/api/workspaces/{workspaceID}/notes', {
            params: { path: { workspaceID: workspace.id } },
            body,
          })
        : api.PUT('/api/workspaces/{workspaceID}/notes/{id}', {
            params: { path: { workspaceID: workspace.id, id } },
            body,
          }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['notes', workspace.id] })
      await client.invalidateQueries({ queryKey: ['note', workspace.id, id] })
      toast.success(id === 'new' ? t('Note created') : t('Note updated'))
      close()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) close()
      }}
    >
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          restoreFocus()
        }}
        onEscapeKeyDown={(e) => {
          if (save.isPending) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (save.isPending) e.preventDefault()
        }}
      >
        <div className="mb-6 flex items-center justify-between">
          <DialogTitle>{id === 'new' ? t('A fresh page') : t('Edit note')}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('Close editor')}
            onClick={close}
            disabled={save.isPending}
          >
            <X />
          </Button>
        </div>
        <DialogDescription>{t('Edit your thoughts, then save your changes.')}</DialogDescription>
        {id !== 'new' && query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <NoteForm
            key={id}
            initial={query.data}
            onSave={(values) => save.mutate(values)}
            onCancel={close}
            pending={save.isPending}
            error={save.error}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
export function NotesPage() {
  const { t, i18n } = useTranslation()
  const workspace = useWorkspace()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [view, setView] = useState('cards')
  const editorTrigger = useRef<HTMLElement | null>(null)
  const openEditor = (id: string) => {
    editorTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditing(id)
  }
  const restoreEditorFocus = () => {
    const trigger = editorTrigger.current
    const selector = trigger?.dataset.noteTrigger
      ? `[data-note-trigger="${trigger.dataset.noteTrigger}"]`
      : trigger?.dataset.noteOpen
        ? `[data-note-open="${trigger.dataset.noteOpen}"]`
        : null
    const target = selector ? document.querySelector<HTMLElement>(selector) : trigger
    if (target?.isConnected) target.focus()
  }
  const actions = (note: components['schemas']['Note']) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-note-trigger={note.id}
          aria-label={t('Actions for {{title}}', { title: note.title })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            editorTrigger.current = document.querySelector<HTMLElement>(
              `[data-note-trigger="${note.id}"]`,
            )
            setEditing(note.id)
          }}
        >
          {t('Edit')}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-red-700" onSelect={() => setDeleting(note.id)}>
          {t('Delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const notes = useQuery(notesQuery(workspace.id, page))
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.DELETE('/api/workspaces/{workspaceID}/notes/{id}', {
        params: { path: { workspaceID: workspace.id, id } },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['notes', workspace.id] })
      client.removeQueries({ queryKey: ['note', workspace.id, deleting] })
      if (editing === deleting) setEditing(null)
      setDeleting(null)
      if (notes.data?.items.length === 1 && page > 1) setPage(page - 1)
      toast.success(t('Note deleted'))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('YOUR WORKSPACE')}</p>
          <h1>
            {t('Notes')} <Badge className="ml-3 align-middle">{notes.data?.total ?? '—'}</Badge>
          </h1>
          <p className="subtitle">{t('A home for thoughts worth keeping.')}</p>
        </div>
        <Button onClick={() => openEditor('new')}>
          <Plus />
          {t('New note')}
        </Button>
      </div>
      {editing && (
        <Editor
          key={editing}
          id={editing}
          close={() => setEditing(null)}
          restoreFocus={restoreEditorFocus}
        />
      )}
      <Tabs value={view} onValueChange={setView}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <span className="text-sm font-medium">{t('All notes')}</span>
          <TabsList aria-label={t('Note views')}>
            <TabsTrigger value="cards">{t('Cards')}</TabsTrigger>
            <TabsTrigger value="table">{t('Table')}</TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            {view === 'table' ? t('Sort current page') : t('Newest first')}
          </span>
        </div>
        {notes.isPending ? (
          <Loading />
        ) : notes.error ? (
          <ErrorState error={notes.error} retry={() => void notes.refetch()} />
        ) : notes.data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-6 py-20 text-center">
            <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#edf2ed] text-primary">
              <FileText size={26} />
            </span>
            <h2 className="text-xl font-semibold">{t('Your next idea starts here')}</h2>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              {t('Capture a thought, draft a plan, or make a little space to think.')}
            </p>
            <Button variant="outline" onClick={() => openEditor('new')}>
              <Plus />
              {t('Create your first note')}
            </Button>
          </div>
        ) : (
          <div>
            <TabsContent value="cards">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {notes.data.items.map((note) => (
                  <article
                    key={note.id}
                    className="group flex min-h-56 flex-col rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => openEditor(note.id)}
                      data-note-open={note.id}
                      aria-label={t('Open {{title}}', { title: note.title })}
                    >
                      <FileText size={19} className="mb-5 text-primary/70" />
                      <h2 className="mb-2 line-clamp-2 font-semibold">{note.title}</h2>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {note.content || t('An open page, full of possibility.')}
                      </p>
                    </button>
                    <div className="mt-5 flex items-center justify-between border-t pt-3">
                      <time
                        className="text-[11px] text-muted-foreground"
                        dateTime={note.updated_at}
                      >
                        {new Date(note.updated_at).toLocaleDateString(i18n.resolvedLanguage, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </time>
                      {actions(note)}
                    </div>
                  </article>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="table">
              <DataTable
                data={notes.data.items}
                pageSize={12}
                serverPage={{ page, total: notes.data.total, onPageChange: setPage }}
                columns={[
                  {
                    accessorKey: 'title',
                    header: t('Title'),
                    cell: ({ row }) => (
                      <button
                        className="max-w-64 truncate text-left font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => openEditor(row.original.id)}
                        data-note-open={row.original.id}
                        aria-label={t('Open {{title}}', { title: row.original.title })}
                      >
                        {row.original.title}
                      </button>
                    ),
                  },
                  {
                    accessorKey: 'updated_at',
                    header: t('Updated'),
                    cell: ({ row }) =>
                      new Date(row.original.updated_at).toLocaleDateString(i18n.resolvedLanguage),
                  },
                  {
                    id: 'actions',
                    header: t('Actions'),
                    enableSorting: false,
                    cell: ({ row }) => actions(row.original),
                  },
                ]}
              />
            </TabsContent>
          </div>
        )}
      </Tabs>
      {view === 'cards' && notes.data && notes.data.total > 12 && (
        <div className="mt-8 flex items-center justify-end gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ArrowLeft />
            {t('Previous')}
          </Button>
          <span className="text-xs">
            {t('Page {{page}} of {{count}}', { page, count: Math.ceil(notes.data.total / 12) })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 12 >= notes.data.total}
            onClick={() => setPage(page + 1)}
          >
            {t('Next')}
            <ArrowRight />
          </Button>
        </div>
      )}
      <Confirm
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null)
        }}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting)
        }}
      />
    </>
  )
}
