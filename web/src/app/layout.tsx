import { LanguageSwitch } from '@/components/language-switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet } from '@tanstack/react-router'
import { FileText, LayoutDashboard, LogOut, Menu, Plus, Sprout, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from '@/features/auth/session'
import { WorkspaceContext } from '@/features/workspaces/context'
import { api, required, errorMessage, setCSRF } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loading, ErrorState } from '@/components/states'
export function AppLayout() {
  const { t } = useTranslation()
  const session = useSession()
  const client = useQueryClient()
  const [selected, setSelected] = useState('')
  const [menu, setMenu] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => required((await api.GET('/api/workspaces')).data).items,
    enabled: !!session.data,
  })
  const current = workspaces.data?.find((w) => w.id === selected) ?? workspaces.data?.[0]
  const logout = useMutation({
    mutationFn: () => api.POST('/api/auth/logout'),
    onSuccess: () => {
      setCSRF('')
      client.clear()
      client.setQueryData(['session'], null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const create = useMutation({
    mutationFn: async () =>
      required((await api.POST('/api/workspaces', { body: { name: name.trim() } })).data),
    onSuccess: async (w) => {
      await client.invalidateQueries({ queryKey: ['workspaces'] })
      setSelected(w.id)
      setAdding(false)
      setName('')
      toast.success(t('Workspace created'))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (session.isPending) return <Loading />
  if (session.error)
    return <ErrorState error={session.error} retry={() => void session.refetch()} />
  if (!session.data) return <Navigate to="/login" />
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b bg-white px-5 md:hidden">
        <span className="flex items-center gap-2 font-semibold">
          <Sprout className="text-primary" />
          monoseed
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('Toggle navigation')}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </Button>
      </header>
      <aside
        className={`${menu ? 'flex' : 'hidden'} fixed bottom-0 left-0 top-16 z-20 w-64 flex-col border-r bg-[#fafbf9] p-5 md:top-0 md:flex`}
      >
        <Link
          to="/"
          className="mb-10 flex items-center gap-2.5 px-2 text-xl font-semibold tracking-tight"
        >
          <span className="rounded-lg bg-primary p-1.5 text-white">
            <Sprout size={21} />
          </span>
          monoseed
        </Link>
        <label
          className="px-2 text-[10px] uppercase tracking-widest text-muted-foreground"
          htmlFor="workspace"
        >
          {t('Workspace')}
        </label>
        <Select value={current?.id ?? ''} onValueChange={setSelected}>
          <SelectTrigger id="workspace" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.data?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog
          open={adding}
          onOpenChange={(open) => {
            if (!create.isPending) {
              setAdding(open)
              if (!open) setName('')
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mb-8 mt-2 justify-start text-muted-foreground"
            >
              <Plus />
              {t('New workspace')}
            </Button>
          </DialogTrigger>
          <DialogContent
            onEscapeKeyDown={(e) => {
              if (create.isPending) e.preventDefault()
            }}
            onPointerDownOutside={(e) => {
              if (create.isPending) e.preventDefault()
            }}
          >
            <DialogTitle>{t('New workspace')}</DialogTitle>
            <DialogDescription>{t('Give your workspace a name.')}</DialogDescription>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
            >
              <label htmlFor="workspace-name">{t('Workspace name')}</label>
              <Input
                id="workspace-name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={create.isPending}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => setAdding(false)}
                >
                  {t('Cancel')}
                </Button>
                <Button disabled={!name.trim() || create.isPending}>{t('Create workspace')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <nav className="space-y-1" aria-label={t('Main navigation')}>
          {(
            [
              { to: '/', label: t('Overview'), icon: LayoutDashboard },
              { to: '/notes', label: t('Notes'), icon: FileText },
              { to: '/account', label: t('Account'), icon: UserRound },
            ] as const
          ).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              activeProps={{ className: 'nav-link active' }}
              inactiveProps={{ className: 'nav-link' }}
              onClick={() => setMenu(false)}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t pt-5">
          <div className="mb-3">
            <LanguageSwitch />
          </div>
          <div className="mb-4 flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{session.data.user.email[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={session.data.user.email}>
                {session.data.user.email}
              </p>
              <Badge className="mt-1">{t(current?.role ?? 'member')}</Badge>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut />
            {t('Sign out')}
          </Button>
        </div>
      </aside>
      <main className="md:ml-64">
        <div className="hidden h-16 items-center justify-between border-b bg-white px-10 text-xs text-muted-foreground md:flex">
          <span>
            {current?.name ?? t('Workspace')} <span className="mx-3 text-border">/</span>
            {t('Your space to grow')}
          </span>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            {t('Personal workspace')}
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-10 sm:py-10">
          {workspaces.isPending ? (
            <Loading />
          ) : workspaces.error ? (
            <ErrorState error={workspaces.error} retry={() => void workspaces.refetch()} />
          ) : current ? (
            <WorkspaceContext.Provider value={current}>
              <div key={current.id}>
                <Outlet />
              </div>
            </WorkspaceContext.Provider>
          ) : (
            <p>{t('Create a workspace to get started.')}</p>
          )}
        </div>
      </main>
    </div>
  )
}
