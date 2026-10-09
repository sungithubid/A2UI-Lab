import { useTranslation } from 'react-i18next'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from './button'
export function Confirm({
  open,
  onOpenChange,
  onConfirm,
  pending,
  title,
  description,
  confirmLabel,
  error,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onConfirm: () => void
  pending: boolean
  title: string
  description: string
  confirmLabel: string
  error?: string
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-6 shadow-xl">
          <AlertDialog.Title className="text-xl font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="my-3 text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          {error && (
            <p role="alert" className="issue">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                {t('Cancel')}
              </Button>
            </AlertDialog.Cancel>
            <Button variant="destructive" disabled={pending} onClick={onConfirm}>
              {pending ? t('Deleting\u2026') : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
