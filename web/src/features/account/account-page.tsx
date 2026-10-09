import { useTranslation } from 'react-i18next'
import { ShieldCheck, UserRound } from 'lucide-react'
import { useSession } from '@/features/auth/session'
import { useWorkspace } from '@/features/workspaces/context'
export function AccountPage() {
  const { t } = useTranslation()
  const session = useSession()
  const workspace = useWorkspace()
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('YOUR PROFILE')}</p>
          <h1>{t('Account')}</h1>
          <p className="subtitle">{t('Your identity and current workspace.')}</p>
        </div>
      </div>
      <section className="max-w-2xl rounded-xl border bg-white p-7">
        <UserRound className="mb-5 size-9 text-primary" />
        <h2 className="mb-6 text-lg font-semibold">{t('Personal information')}</h2>
        <dl className="space-y-5 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('Email address')}</dt>
            <dd className="mt-1 break-all font-medium">{session.data?.user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('Workspace')}</dt>
            <dd className="mt-1 font-medium">{workspace.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('Role')}</dt>
            <dd className="mt-1 font-medium capitalize">{t(workspace.role)}</dd>
          </div>
        </dl>
        <div className="mt-8 flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground">
          <ShieldCheck size={16} />
          {t('Your account is managed by your administrator.')}
        </div>
      </section>
    </>
  )
}
