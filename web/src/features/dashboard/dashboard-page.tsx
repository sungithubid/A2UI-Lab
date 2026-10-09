import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, FileText, Plus, Sparkles } from 'lucide-react'
import { useWorkspace } from '@/features/workspaces/context'
import { notesQuery } from '@/features/notes/queries'
import { Button } from '@/components/ui/button'
import { ErrorState, Loading } from '@/components/states'
export function DashboardPage() {
  const { t } = useTranslation()
  const workspace = useWorkspace()
  const notes = useQuery(notesQuery(workspace.id))
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('OVERVIEW')}</p>
          <h1>{t('A little clarity, every day.')}</h1>
          <p className="subtitle">
            {t('Welcome to {{name}}. Make something worth keeping.', { name: workspace.name })}
          </p>
        </div>
      </div>
      <section className="mb-8 flex flex-col justify-between gap-6 rounded-2xl bg-[#e7efe8] p-7 sm:flex-row sm:items-center">
        <div>
          <Sparkles className="mb-4 text-primary" />
          <h2 className="text-2xl font-medium tracking-tight">
            {t('Good ideas need a place to grow.')}
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#527064]">
            {t(
              'Bring your notes and plans together. Start with one thought, and see where it takes you.',
            )}
          </p>
        </div>
        <Button asChild>
          <Link to="/notes">
            <Plus />
            {t('Write a note')}
          </Link>
        </Button>
      </section>
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <div className="stat">
          <FileText size={18} />
          <p>{notes.data?.total ?? '—'}</p>
          <span>{t('Notes in this workspace')}</span>
        </div>
        <div className="stat">
          <span className="text-xs uppercase tracking-wider">{t('Your role')}</span>
          <p className="capitalize">{t(workspace.role)}</p>
          <span>{t('Space to create and collaborate')}</span>
        </div>
        <div className="stat">
          <span className="text-xs uppercase tracking-wider">{t('One step at a time')}</span>
          <p>{t('Make it yours.')}</p>
          <span>{t('Small beginnings. Real progress.')}</span>
        </div>
      </div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('Recently created')}</h2>
        <Link to="/notes" className="flex items-center gap-1 text-sm text-primary">
          {t('View all notes')}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {notes.isPending ? (
        <Loading />
      ) : notes.error ? (
        <ErrorState error={notes.error} retry={() => void notes.refetch()} />
      ) : notes.data.items.length ? (
        <div className="rounded-xl border bg-white">
          {notes.data.items.slice(0, 4).map((note) => (
            <Link
              key={note.id}
              to="/notes"
              className="flex items-center gap-4 border-b p-5 last:border-0 hover:bg-accent"
            >
              <FileText className="size-5 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{note.title}</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {note.content || t('No content yet')}
                </p>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-white py-12 text-center">
          <FileText className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('A fresh start. Your notes will appear here.')}
          </p>
        </div>
      )}
    </>
  )
}
