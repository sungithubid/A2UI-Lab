import { errorMessage } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'
export function Loading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex items-center gap-3 py-16 text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" />
      {t('Loading your workspace\u2026')}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="my-6 rounded-xl border border-red-200 bg-red-50 p-5">
      <TriangleAlert className="mb-2 size-5 text-red-700" />
      <p>{errorMessage(error)}</p>
      {retry && (
        <Button className="mt-4" variant="outline" onClick={retry}>
          {t('Try again')}
        </Button>
      )}
    </div>
  )
}
